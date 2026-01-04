import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { handler } from './index';

// Mock console to prevent cluttering test output
vi.spyOn(console, 'error').mockImplementation(() => {});
vi.spyOn(console, 'log').mockImplementation(() => {});

const createMockContext = (): Context => ({
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'testFunction',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:testFunction',
  memoryLimitInMB: '128',
  awsRequestId: 'test-request-id',
  logGroupName: '/aws/lambda/testFunction',
  logStreamName: '2023/01/01/[$LATEST]testStream',
  getRemainingTimeInMillis: () => 30000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
});

describe('zero-shot-region-selector', () => {
  let base64Image: string;

  beforeAll(async () => {
    const imagePath = path.join(__dirname, '../test/textures/115506837.jpeg');
    const imageBuffer = await fs.readFile(imagePath);
    base64Image = imageBuffer.toString('base64');
  });

  it('should return 400 for missing labels', async () => {
    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        image: base64Image,
        labels: [],
        threshold: 0.5,
      }),
      httpMethod: 'POST',
      headers: { 'Content-Type': 'application/json' },
      isBase64Encoded: false,
      path: '/zero-shot-region-selector',
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      pathParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: '',
      multiValueHeaders: {},
    };

    const result = await handler(event, createMockContext());
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain('labels field is required');
  });

  it('should return 400 for missing image', async () => {
    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        labels: ['cat'],
        threshold: 0.5,
      }),
      httpMethod: 'POST',
      headers: { 'Content-Type': 'application/json' },
      isBase64Encoded: false,
      path: '/zero-shot-region-selector',
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      pathParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: '',
      multiValueHeaders: {},
    };

    const result = await handler(event, createMockContext());
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain('image field is required');
  });

  it('should return 400 for invalid threshold', async () => {
    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        image: base64Image,
        labels: ['cat'],
        threshold: 1.5,
      }),
      httpMethod: 'POST',
      headers: { 'Content-Type': 'application/json' },
      isBase64Encoded: false,
      path: '/zero-shot-region-selector',
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      pathParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: '',
      multiValueHeaders: {},
    };

    const result = await handler(event, createMockContext());
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain('threshold must be a number between 0 and 1');
  });

  it('should handle OPTIONS request for CORS', async () => {
    const event: APIGatewayProxyEvent = {
      body: null,
      httpMethod: 'OPTIONS',
      headers: {},
      isBase64Encoded: false,
      path: '/zero-shot-region-selector',
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      pathParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: '',
      multiValueHeaders: {},
    };

    const result = await handler(event, createMockContext());
    expect(result.statusCode).toBe(200);
    expect(result.headers?.['Access-Control-Allow-Origin']).toBe('*');
    expect(result.headers?.['Access-Control-Allow-Methods']).toBe('POST, OPTIONS');
  });

  // Skip the actual SageMaker call test - requires real AWS credentials
  it.skip('should detect objects using SageMaker OWLv2', async () => {
    process.env.SAGEMAKER_ENDPOINT_NAME = 'owlv2-base-patch16-ensemble';
    process.env.SAGEMAKER_REGION = 'us-east-1';

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        image: base64Image,
        labels: ['boat', 'water', 'sky'],
        threshold: 0.1,
      }),
      httpMethod: 'POST',
      headers: { 'Content-Type': 'application/json' },
      isBase64Encoded: false,
      path: '/zero-shot-region-selector',
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      pathParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: '',
      multiValueHeaders: {},
    };

    const result = await handler(event, createMockContext());
    console.log('Response:', result.body);

    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.count).toBeGreaterThan(0);
    expect(body.regions[0]).toHaveProperty('bbox');
    expect(body.regions[0]).toHaveProperty('score');
    expect(body.regions[0]).toHaveProperty('label');
    expect(body.endpoint).toContain('sagemaker://');
  }, 30000);
});
