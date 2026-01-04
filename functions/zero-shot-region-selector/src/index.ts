import { InvokeEndpointCommand, SageMakerRuntimeClient } from '@aws-sdk/client-sagemaker-runtime';
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
  endpoint: string;
}

/**
 * Raw API response element
 */
interface ZeroShotDetectionResult {
  score: number;
  label: string;
  box: BoundingBox;
}

// SageMaker endpoint configuration
const SAGEMAKER_ENDPOINT_NAME =
  process.env.SAGEMAKER_ENDPOINT_NAME || 'owlv2-base-patch16-ensemble';
const SAGEMAKER_REGION = process.env.SAGEMAKER_REGION || 'us-east-1';

// Create SageMaker Runtime client
const sagemakerClient = new SageMakerRuntimeClient({ region: SAGEMAKER_REGION });

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

  return {
    image: parsed.image,
    labels: parsed.labels.map((l: string) => l.trim()),
    threshold,
  };
}

/**
 * Remove data URI prefix from base64 string if present
 */
function cleanBase64(base64: string): string {
  return base64.replace(/^data:image\/\w+;base64,/, '');
}

/**
 * Call SageMaker endpoint for zero-shot object detection
 */
async function callSageMakerEndpoint(
  base64Image: string,
  labels: string[]
): Promise<ZeroShotDetectionResult[]> {
  console.log(
    `Calling SageMaker endpoint: ${SAGEMAKER_ENDPOINT_NAME} with ${labels.length} labels...`
  );

  // Clean base64 data
  const cleanedBase64 = cleanBase64(base64Image);

  // Prepare the payload for OWLv2
  // The expected format depends on your SageMaker model deployment
  const payload = {
    image: cleanedBase64,
    candidate_labels: labels,
  };

  const command = new InvokeEndpointCommand({
    EndpointName: SAGEMAKER_ENDPOINT_NAME,
    ContentType: 'application/json',
    Accept: 'application/json',
    Body: JSON.stringify(payload),
  });

  const response = await sagemakerClient.send(command);

  if (!response.Body) {
    throw new Error('Empty response from SageMaker endpoint');
  }

  // Parse the response
  const responseBody = new TextDecoder().decode(response.Body);
  console.log('SageMaker Response:', responseBody.slice(0, 500));

  const result: unknown = JSON.parse(responseBody);

  // Handle different response formats
  if (Array.isArray(result)) {
    return result;
  }

  // Some models return { predictions: [...] }
  if (result && typeof result === 'object' && 'predictions' in result) {
    const predictions = (result as { predictions: unknown }).predictions;
    if (Array.isArray(predictions)) {
      return predictions;
    }
  }

  // Some models return { error: "..." }
  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error(`Model error: ${(result as { error: string }).error}`);
  }

  console.warn('Unexpected response format, returning empty array');
  return [];
}

/**
 * Transform API results to our response format
 */
function transformResults(results: ZeroShotDetectionResult[], threshold: number): DetectedRegion[] {
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
    // Parse request
    const { image, labels, threshold } = parseRequestBody(event.body);

    console.log(`Processing with SageMaker endpoint: ${SAGEMAKER_ENDPOINT_NAME}`);
    console.log(`Region: ${SAGEMAKER_REGION}`);
    console.log(`Labels: [${labels.join(', ')}]`);
    console.log(`Threshold: ${threshold}`);

    // Call SageMaker endpoint
    const detectionResults = await callSageMakerEndpoint(image, labels);
    console.log(`SageMaker returned ${detectionResults.length} raw results`);

    // Transform and filter results
    const regions = transformResults(detectionResults, threshold!);
    console.log(`Found ${regions.length} regions above threshold ${threshold}`);

    const response: ResponseBody = {
      regions,
      count: regions.length,
      searchedLabels: labels,
      endpoint: `sagemaker://${SAGEMAKER_REGION}/${SAGEMAKER_ENDPOINT_NAME}`,
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';
    const statusCode =
      message.includes('required') || message.includes('must be')
        ? 400
        : message.includes('loading')
          ? 503
          : 500;

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
