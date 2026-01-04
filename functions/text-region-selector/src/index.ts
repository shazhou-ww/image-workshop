import { InferenceClient } from '@huggingface/inference';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

/**
 * Request body for text-region-selector
 */
interface RequestBody {
  /** Base64 encoded image data (with or without data URI prefix) */
  image: string;
  /** Text query to match regions against (e.g., "boat", "cat", "car") */
  query: string;
  /** Confidence threshold (0-1), default 0.3 */
  threshold?: number;
}

/**
 * A detected region matching the query
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
  /** Array of detected regions matching the query */
  regions: DetectedRegion[];
  /** Number of regions detected */
  count: number;
  /** All detected objects (before filtering by query) */
  allDetections?: DetectedRegion[];
}

const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY;

// COCO dataset labels that DETR can detect
const COCO_LABELS = [
  'person',
  'bicycle',
  'car',
  'motorcycle',
  'airplane',
  'bus',
  'train',
  'truck',
  'boat',
  'traffic light',
  'fire hydrant',
  'stop sign',
  'parking meter',
  'bench',
  'bird',
  'cat',
  'dog',
  'horse',
  'sheep',
  'cow',
  'elephant',
  'bear',
  'zebra',
  'giraffe',
  'backpack',
  'umbrella',
  'handbag',
  'tie',
  'suitcase',
  'frisbee',
  'skis',
  'snowboard',
  'sports ball',
  'kite',
  'baseball bat',
  'baseball glove',
  'skateboard',
  'surfboard',
  'tennis racket',
  'bottle',
  'wine glass',
  'cup',
  'fork',
  'knife',
  'spoon',
  'bowl',
  'banana',
  'apple',
  'sandwich',
  'orange',
  'broccoli',
  'carrot',
  'hot dog',
  'pizza',
  'donut',
  'cake',
  'chair',
  'couch',
  'potted plant',
  'bed',
  'dining table',
  'toilet',
  'tv',
  'laptop',
  'mouse',
  'remote',
  'keyboard',
  'cell phone',
  'microwave',
  'oven',
  'toaster',
  'sink',
  'refrigerator',
  'book',
  'clock',
  'vase',
  'scissors',
  'teddy bear',
  'hair drier',
  'toothbrush',
];

// Mapping of common query terms to COCO labels
const QUERY_MAPPINGS: Record<string, string[]> = {
  ship: ['boat'],
  'sailing ship': ['boat'],
  sailboat: ['boat'],
  帆船: ['boat'],
  船: ['boat'],
  vehicle: ['car', 'truck', 'bus', 'motorcycle', 'bicycle', 'train', 'airplane', 'boat'],
  animal: ['bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe'],
  furniture: ['chair', 'couch', 'bed', 'dining table'],
  food: [
    'banana',
    'apple',
    'sandwich',
    'orange',
    'broccoli',
    'carrot',
    'hot dog',
    'pizza',
    'donut',
    'cake',
  ],
};

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

  const threshold = parsed.threshold ?? 0.3;
  if (typeof threshold !== 'number' || threshold < 0 || threshold > 1) {
    throw new Error('threshold must be a number between 0 and 1');
  }

  return {
    image: parsed.image,
    query: parsed.query.trim().toLowerCase(),
    threshold,
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
 * Get matching COCO labels for a query
 */
function getMatchingLabels(query: string): string[] {
  const lowerQuery = query.toLowerCase();

  // Check if there's a direct mapping
  if (QUERY_MAPPINGS[lowerQuery]) {
    return QUERY_MAPPINGS[lowerQuery];
  }

  // Check if query is a COCO label
  if (COCO_LABELS.includes(lowerQuery)) {
    return [lowerQuery];
  }

  // Check if query is contained in any COCO label
  const partialMatches = COCO_LABELS.filter(
    (label) => label.includes(lowerQuery) || lowerQuery.includes(label)
  );
  if (partialMatches.length > 0) {
    return partialMatches;
  }

  // Return empty - will match all detections
  return [];
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

    console.log(`Processing query: "${query}" with threshold: ${threshold}`);
    console.log(`HUGGINGFACE_API_KEY configured: yes (length: ${HUGGINGFACE_API_KEY.length})`);

    // Initialize Hugging Face Inference Client
    const hf = new InferenceClient(HUGGINGFACE_API_KEY);

    // Convert base64 to Blob
    const imageBlob = base64ToBlob(image);

    // Get matching labels for the query
    const matchingLabels = getMatchingLabels(query);
    console.log(`Query "${query}" maps to labels: [${matchingLabels.join(', ')}]`);

    // Use object detection to get bounding boxes
    console.log('Calling objectDetection with facebook/detr-resnet-50...');
    const detectionResult = await hf.objectDetection({
      model: 'facebook/detr-resnet-50',
      data: imageBlob,
    });
    console.log(`Object detection found ${detectionResult.length} objects`);

    // Transform all detections
    const allDetections: DetectedRegion[] = detectionResult
      .filter((d) => d.score >= threshold!)
      .map((d) => ({
        bbox: [
          Math.round(d.box.xmin),
          Math.round(d.box.ymin),
          Math.round(d.box.xmax - d.box.xmin),
          Math.round(d.box.ymax - d.box.ymin),
        ] as [number, number, number, number],
        score: d.score,
        label: d.label,
      }))
      .sort((a, b) => b.score - a.score);

    // Filter by matching labels (if any)
    const regions: DetectedRegion[] =
      matchingLabels.length > 0
        ? allDetections.filter((d) => matchingLabels.includes(d.label.toLowerCase()))
        : allDetections;

    console.log(`Found ${regions.length} regions matching query "${query}"`);

    const response: ResponseBody = {
      regions,
      count: regions.length,
      allDetections,
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
