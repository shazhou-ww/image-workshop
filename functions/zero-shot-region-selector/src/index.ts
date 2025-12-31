import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

/**
 * Request body for zero-shot-region-selector
 */
interface RequestBody {
  /** Base64 encoded image data (with or without data URI prefix) */
  image: string;
  /** Text labels to detect (e.g., ["sailing ship", "ocean", "lighthouse"]) */
  labels: string[];
  /** Confidence threshold (0-1), default 0.1 */
  threshold?: number;
  /** 
   * Custom Inference Endpoint URL for zero-shot object detection.
   * Required since HF Inference API doesn't support this task natively.
   * Deploy models like:
   *   - google/owlvit-base-patch32
   *   - IDEA-Research/grounding-dino-tiny
   * to an Inference Endpoint and provide the URL.
   * @example "https://xxx.endpoints.huggingface.cloud"
   */
  endpointUrl?: string;
}

/**
 * Bounding box from the API
 */
interface BoundingBox {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

/**
 * A detected region from zero-shot detection
 */
interface DetectedRegion {
  /** Bounding box [x, y, width, height] in pixels */
  bbox: [number, number, number, number];
  /** Detection confidence score */
  score: number;
  /** The detected label */
  label: string;
}

/**
 * Response body
 */
interface ResponseBody {
  /** Array of detected regions matching the labels */
  regions: DetectedRegion[];
  /** Number of regions detected */
  count: number;
  /** Labels that were searched for */
  searchedLabels: string[];
  /** Endpoint used for detection */
  endpoint?: string;
}

/**
 * Raw API response element
 */
interface ZeroShotDetectionResult {
  score: number;
  label: string;
  box: BoundingBox;
}

const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY;

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

  if (!parsed.labels || !Array.isArray(parsed.labels) || parsed.labels.length === 0) {
    throw new Error('labels field is required and must be a non-empty array of strings');
  }

  for (const label of parsed.labels) {
    if (typeof label !== 'string' || label.trim() === '') {
      throw new Error('Each label must be a non-empty string');
    }
  }

  const threshold = parsed.threshold ?? 0.1;
  if (typeof threshold !== 'number' || threshold < 0 || threshold > 1) {
    throw new Error('threshold must be a number between 0 and 1');
  }

  if (!parsed.endpointUrl || typeof parsed.endpointUrl !== 'string') {
    throw new Error(
      'endpointUrl is required. HuggingFace Inference API does not natively support zero-shot object detection. ' +
      'Please deploy a model (e.g., google/owlvit-base-patch32 or IDEA-Research/grounding-dino-tiny) ' +
      'to a HuggingFace Inference Endpoint and provide the endpoint URL.'
    );
  }

  return {
    image: parsed.image,
    labels: parsed.labels.map((l: string) => l.trim()),
    threshold,
    endpointUrl: parsed.endpointUrl,
  };
}

/**
 * Convert base64 string to Blob for the inference client
 */
function base64ToBlob(base64: string, mimeType = 'image/jpeg'): Blob {
  // Remove data URI prefix if present
  const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

/**
 * Call the zero-shot object detection endpoint
 */
async function callZeroShotDetection(
  imageBlob: Blob,
  labels: string[],
  endpointUrl: string
): Promise<ZeroShotDetectionResult[]> {
  console.log(`Calling endpoint: ${endpointUrl} with ${labels.length} labels...`);

  // Create form data with image and parameters
  const formData = new FormData();
  formData.append('image', imageBlob, 'image.jpg');
  formData.append('candidate_labels', JSON.stringify(labels));

  // Try sending as multipart form first
  let response = await fetch(endpointUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${HUGGINGFACE_API_KEY}`,
    },
    body: formData,
  });

  // If that fails, try JSON format
  if (!response.ok && response.status === 415) {
    console.log('Trying JSON format...');
    const arrayBuffer = await imageBlob.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    
    response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HUGGINGFACE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: {
          image: base64,
        },
        parameters: {
          candidate_labels: labels,
        },
      }),
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`API Error (${response.status}):`, errorText);
    
    // Handle model loading
    if (response.status === 503) {
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error?.includes('loading')) {
          throw new Error(`Model is loading. Estimated time: ${errorData.estimated_time || 'unknown'}s. Please retry.`);
        }
      } catch (e) {
        // Ignore JSON parse error
      }
    }
    
    throw new Error(`Endpoint API error: ${response.status} - ${errorText}`);
  }

  const result: unknown = await response.json();
  console.log('API Response:', JSON.stringify(result).slice(0, 500));
  
  // Handle different response formats
  if (Array.isArray(result)) {
    return result;
  }
  
  // Some models return { error: "..." }
  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error(`Model error: ${(result as { error: string }).error}`);
  }

  return [];
}

/**
 * Transform API results to our response format
 */
function transformResults(
  results: ZeroShotDetectionResult[],
  threshold: number
): DetectedRegion[] {
  return results
    .filter((r) => r.score >= threshold)
    .map((r) => ({
      bbox: [
        Math.round(r.box.xmin),
        Math.round(r.box.ymin),
        Math.round(r.box.xmax - r.box.xmin),
        Math.round(r.box.ymax - r.box.ymin),
      ] as [number, number, number, number],
      score: r.score,
      label: r.label,
    }))
    .sort((a, b) => b.score - a.score);
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

  // Handle OPTIONS for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  try {
    // Parse request first (to validate input before checking API key)
    const { image, labels, threshold, endpointUrl } = parseRequestBody(event.body);

    // Validate API key
    if (!HUGGINGFACE_API_KEY) {
      throw new Error('HUGGINGFACE_API_KEY environment variable is not set');
    }

    console.log(`Processing with endpoint: ${endpointUrl}`);
    console.log(`Labels: [${labels.join(', ')}]`);
    console.log(`Threshold: ${threshold}`);

    // Convert base64 to Blob
    const imageBlob = base64ToBlob(image);

    // Call the zero-shot object detection endpoint
    const detectionResults = await callZeroShotDetection(imageBlob, labels, endpointUrl!);
    console.log(`Detection API returned ${detectionResults.length} raw results`);

    // Transform and filter results
    const regions = transformResults(detectionResults, threshold!);
    console.log(`Found ${regions.length} regions above threshold ${threshold}`);

    const response: ResponseBody = {
      regions,
      count: regions.length,
      searchedLabels: labels,
      endpoint: endpointUrl,
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';
    const statusCode = message.includes('required') || message.includes('must be') ? 400 : 
                       message.includes('loading') ? 503 : 500;

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
