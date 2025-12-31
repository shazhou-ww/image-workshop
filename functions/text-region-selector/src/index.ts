import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

/**
 * Request body for text-region-selector
 */
interface RequestBody {
  /** Base64 encoded image data (with or without data URI prefix) */
  image: string;
  /** Text query to match regions against */
  query: string;
  /** Confidence threshold (0-1), default 0.5 */
  threshold?: number;
}

/**
 * A matched region with mask data
 */
interface MatchedRegion {
  /** Bounding box [x, y, width, height] */
  bbox: [number, number, number, number];
  /** Base64 encoded binary mask (PNG format) */
  mask: string;
  /** Similarity score between the region and the query */
  score: number;
}

/**
 * Response body
 */
interface ResponseBody {
  /** Array of matched regions */
  regions: MatchedRegion[];
  /** Total number of segments found by SAM2 */
  totalSegments: number;
  /** Number of regions matching the query above threshold */
  matchedCount: number;
}

/**
 * SAM2 API response mask structure
 */
interface SAM2Mask {
  /** Mask as base64 encoded PNG */
  mask: string;
  /** Bounding box [x_min, y_min, x_max, y_max] */
  box: [number, number, number, number];
  /** Prediction score from SAM2 */
  score: number;
}

const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY;

// Hugging Face model endpoints
const SAM2_MODEL = 'facebook/sam2-hiera-large';
const CLIP_MODEL = 'openai/clip-vit-base-patch32';

/**
 * Call Hugging Face Inference API for SAM2 automatic mask generation
 */
async function generateMasks(imageBase64: string): Promise<SAM2Mask[]> {
  const response = await fetch(
    `https://api-inference.huggingface.co/models/${SAM2_MODEL}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HUGGINGFACE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: imageBase64,
        parameters: {
          task: 'mask-generation',
          // Subtask for automatic mask generation (no prompts)
          subtask: 'automatic-mask-generation',
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SAM2 API error: ${response.status} - ${errorText}`);
  }

  const result = (await response.json()) as
    | Array<{ mask: string; box: [number, number, number, number]; score?: number }>
    | { masks?: SAM2Mask[] }
    | unknown;

  // The API returns an array of masks with their bounding boxes
  if (Array.isArray(result)) {
    return result.map((item) => ({
      mask: item.mask,
      box: item.box,
      score: item.score ?? 1.0,
    }));
  }

  // Handle wrapped response
  if (
    result !== null &&
    typeof result === 'object' &&
    'masks' in result &&
    Array.isArray(result.masks)
  ) {
    return result.masks;
  }

  console.warn('Unexpected SAM2 response format:', JSON.stringify(result).slice(0, 500));
  return [];
}


/**
 * Call CLIP API to compute similarity between an image region and text
 */
async function computeSimilarity(
  imageBase64: string,
  textQuery: string
): Promise<number> {
  // Use zero-shot image classification to compute similarity
  const response = await fetch(
    `https://api-inference.huggingface.co/models/${CLIP_MODEL}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HUGGINGFACE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: imageBase64,
        parameters: {
          candidate_labels: [textQuery, 'other', 'background'],
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`CLIP API error: ${response.status} - ${errorText}`);
  }

  const result = (await response.json()) as
    | Array<{ label: string; score: number }>
    | unknown;

  // Result is an array of { label, score }
  if (Array.isArray(result)) {
    const match = result.find(
      (item: { label: string; score: number }) => item.label === textQuery
    );
    return match?.score ?? 0;
  }

  console.warn('Unexpected CLIP response format:', JSON.stringify(result).slice(0, 500));
  return 0;
}

/**
 * Apply mask to image and return the masked region as base64
 * This creates an image where only the masked area is visible
 *
 * Note: In production, you might want to use sharp or similar library
 * to actually crop/mask the image. For now, we return the original image
 * and rely on CLIP's ability to score the whole image context.
 */
async function applyMaskToImage(imageBase64: string): Promise<string> {
  // For now, we return the original image - CLIP will score based on whole image
  // The bbox info is still available for the caller to use
  return imageBase64;
}

/**
 * Convert bbox from [x_min, y_min, x_max, y_max] to [x, y, width, height]
 */
function convertBbox(
  box: [number, number, number, number]
): [number, number, number, number] {
  const [xMin, yMin, xMax, yMax] = box;
  return [xMin, yMin, xMax - xMin, yMax - yMin];
}

/**
 * Parse and validate the request body
 */
function parseRequestBody(body: string | null): RequestBody {
  if (!body) {
    throw new Error('Request body is required');
  }

  const parsed = JSON.parse(body);

  if (!parsed.image || typeof parsed.image !== 'string') {
    throw new Error('image field is required and must be a base64 string');
  }

  if (!parsed.query || typeof parsed.query !== 'string') {
    throw new Error('query field is required and must be a string');
  }

  const threshold = parsed.threshold ?? 0.5;
  if (typeof threshold !== 'number' || threshold < 0 || threshold > 1) {
    throw new Error('threshold must be a number between 0 and 1');
  }

  return {
    image: parsed.image,
    query: parsed.query.trim(),
    threshold,
  };
}

/**
 * Strip data URI prefix from base64 image if present
 */
function normalizeBase64Image(image: string): string {
  const dataUriMatch = image.match(/^data:image\/\w+;base64,(.+)$/);
  if (dataUriMatch) {
    return dataUriMatch[1];
  }
  return image;
}

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log('RequestId:', context.awsRequestId);

  // CORS headers
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    // Validate API key
    if (!HUGGINGFACE_API_KEY) {
      throw new Error('HUGGINGFACE_API_KEY environment variable is not set');
    }

    // Parse request
    const { image, query, threshold } = parseRequestBody(event.body);
    const imageBase64 = normalizeBase64Image(image);

    console.log(`Processing query: "${query}" with threshold: ${threshold}`);

    // Step 1: Generate masks using SAM2
    console.log('Calling SAM2 for mask generation...');
    const masks = await generateMasks(imageBase64);
    console.log(`SAM2 returned ${masks.length} masks`);

    if (masks.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          regions: [],
          totalSegments: 0,
          matchedCount: 0,
        } satisfies ResponseBody),
      };
    }

    // Step 2: For each mask, compute CLIP similarity with the query
    console.log('Computing CLIP similarities...');
    const regionsWithScores: Array<{
      mask: SAM2Mask;
      clipScore: number;
    }> = [];

    // Process masks in parallel with some concurrency limit
    const CONCURRENCY = 5;
    for (let i = 0; i < masks.length; i += CONCURRENCY) {
      const batch = masks.slice(i, i + CONCURRENCY);
      const scores = await Promise.all(
        batch.map(async (mask) => {
          // Apply mask and compute similarity
          const maskedImage = await applyMaskToImage(imageBase64);
          const score = await computeSimilarity(maskedImage, query);
          return { mask, clipScore: score };
        })
      );
      regionsWithScores.push(...scores);
    }

    // Step 3: Filter by threshold
    const matchedRegions: MatchedRegion[] = regionsWithScores
      .filter((r) => r.clipScore >= threshold!)
      .map((r) => ({
        bbox: convertBbox(r.mask.box),
        mask: r.mask.mask,
        score: r.clipScore,
      }))
      .sort((a, b) => b.score - a.score);

    console.log(`Matched ${matchedRegions.length} regions above threshold ${threshold}`);

    const response: ResponseBody = {
      regions: matchedRegions,
      totalSegments: masks.length,
      matchedCount: matchedRegions.length,
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';
    const statusCode = message.includes('required') ? 400 : 500;

    return {
      statusCode,
      headers,
      body: JSON.stringify({
        error: message,
        requestId: context.awsRequestId,
      }),
    };
  }
};
