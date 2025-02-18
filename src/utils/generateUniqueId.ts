/**
 * Reusable buffer for timestamp and random bytes.
 */
const BUFFER_SIZE = 12; // 6 bytes timestamp + 6 bytes random
const buffer = new Uint8Array(BUFFER_SIZE);

/**
 * Base64 URL-safe encoding using btoa (Browser).
 */
function encodeBase64UrlSafe(bytes: Uint8Array): string {
  let base64: string;
  if (typeof btoa === 'function') {
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    base64 = btoa(binary);
  } else {
    throw new Error(
      'No method available to perform Base64 encoding. Ensure you are running in a browser environment or use a polyfill for btoa.'
    );
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Generates an optimized Base64 URL-safe unique ID with enhanced entropy.
 * @returns Base64 URL-safe encoded unique ID string.
 */
export function generateBase64UrlSafeId(): string {
  // Get current timestamp in milliseconds
  const timestamp = Date.now();

  // Populate buffer with timestamp bytes (big endian)
  buffer[0] = (timestamp >> 40) & 0xff;
  buffer[1] = (timestamp >> 32) & 0xff;
  buffer[2] = (timestamp >> 24) & 0xff;
  buffer[3] = (timestamp >> 16) & 0xff;
  buffer[4] = (timestamp >> 8) & 0xff;
  buffer[5] = timestamp & 0xff;

  // Populate buffer with random bytes
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(buffer.subarray(6, 12));
  } else {
    for (let i = 6; i < 12; i++) {
      buffer[i] = Math.floor(Math.random() * 256);
    }
  }

  // Encode buffer to Base64 URL-safe string
  return encodeBase64UrlSafe(buffer);
}
