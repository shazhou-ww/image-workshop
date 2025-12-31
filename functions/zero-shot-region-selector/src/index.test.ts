import { describe, expect, it } from 'vitest';
import { handler } from './index';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

function createMockEvent(body: object): APIGatewayProxyEvent {
  return {
    body: JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/zero-shot-region-selector',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    resource: '',
  };
}

function createMockContext(): Context {
  return {
    awsRequestId: 'test-request-id',
    callbackWaitsForEmptyEventLoop: true,
    functionName: 'test-function',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789:function:test',
    memoryLimitInMB: '512',
    logGroupName: '/aws/lambda/test',
    logStreamName: 'test-stream',
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };
}

describe('zero-shot-region-selector', () => {
  it('should return 400 for missing endpointUrl with helpful message', async () => {
    const event = createMockEvent({
      image: 'base64data',
      labels: ['cat', 'dog'],
    });

    const result = await handler(event, createMockContext());

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain('endpointUrl');
    expect(body.error).toContain('Inference Endpoint');
    expect(body.error).toContain('owlvit');
  });

  it('should return 400 for missing labels', async () => {
    const event = createMockEvent({
      image: 'base64data',
      labels: [],
      endpointUrl: 'https://example.com/endpoint',
    });

    const result = await handler(event, createMockContext());

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain('labels');
  });

  it('should return 400 for missing image', async () => {
    const event = createMockEvent({
      labels: ['cat'],
      endpointUrl: 'https://example.com/endpoint',
    });

    const result = await handler(event, createMockContext());

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain('image');
  });

  it('should return 400 for invalid threshold', async () => {
    const event = createMockEvent({
      image: 'base64data',
      labels: ['cat'],
      endpointUrl: 'https://example.com/endpoint',
      threshold: 2.0, // Invalid: must be 0-1
    });

    const result = await handler(event, createMockContext());

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain('threshold');
  });

  // Skip integration test unless endpoint is provided
  it.skip('should detect objects using custom endpoint (requires deployed endpoint)', async () => {
    // To run this test:
    // 1. Deploy google/owlvit-base-patch32 or IDEA-Research/grounding-dino-tiny to an Inference Endpoint
    // 2. Set HUGGINGFACE_API_KEY environment variable
    // 3. Update endpointUrl below
    // 4. Remove the .skip from this test

    const event = createMockEvent({
      image: 'base64ImageDataHere',
      labels: ['cat', 'remote control'],
      endpointUrl: 'https://your-endpoint.endpoints.huggingface.cloud',
      threshold: 0.1,
    });

    const result = await handler(event, createMockContext());
    
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body).toHaveProperty('regions');
    expect(body).toHaveProperty('count');
    expect(body).toHaveProperty('searchedLabels');
  });
});
