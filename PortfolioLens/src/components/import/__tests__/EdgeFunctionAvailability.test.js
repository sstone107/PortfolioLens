/**
 * Jest test for Edge Function availability
 * 
 * This test ensures that the process-import-job Edge Function is deployed
 * and accessible. It's designed to catch the 404 issue early.
 * 
 * Note: This test requires Jest to be properly configured in the project.
 * If Jest is not set up, use the edgeFunctionHealthCheck utility instead.
 */

const EDGE_FUNCTION_URL = 'https://kukfbbaevndujnodafnk.supabase.co/functions/v1/process-import-job';

describe('Edge Function Availability', () => {
  let corsPreflightWorking = false;
  let postEndpointAccessible = false;

  beforeAll(async () => {
    // Test CORS preflight
    try {
      const corsResponse = await fetch(EDGE_FUNCTION_URL, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:3000',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization, content-type'
        }
      });
      corsPreflightWorking = corsResponse.status === 200;
    } catch (error) {
      console.error('CORS preflight test failed:', error);
    }

    // Test POST endpoint (should return 401 for missing auth, not 404)
    try {
      const postResponse = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          job_id: 'test-job',
          filename: 'test.csv',
          user_id: 'test-user'
        })
      });
      // If we get 401, the function exists but auth failed (expected)
      // If we get 404, the function is not deployed (problem)
      postEndpointAccessible = postResponse.status !== 404;
    } catch (error) {
      console.error('POST endpoint test failed:', error);
    }
  }, 10000); // 10 second timeout for network requests

  it('should respond to CORS preflight requests', () => {
    expect(corsPreflightWorking).toBe(true);
  });

  it('should not return 404 for POST requests', () => {
    expect(postEndpointAccessible).toBe(true);
  });

  it('should be deployed and accessible', () => {
    expect(corsPreflightWorking && postEndpointAccessible).toBe(true);
  });
});

module.exports = {
  EDGE_FUNCTION_URL
};