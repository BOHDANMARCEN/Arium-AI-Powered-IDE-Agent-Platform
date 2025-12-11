/**
 * Example JavaScript tool
 * This shows how to write a tool that runs in the sandboxed JS runner
 * 
 * IMPORTANT: Do not use ES6 export syntax (export default, export function)
 * The VM2 sandbox does not support ES6 modules. Use plain function declaration.
 */

// Define async function (no export needed - VM2 will find it by name)
async function run(args) {
  const { text } = args;
  
  if (!text) {
    return {
      ok: false,
      error: { message: "Missing required parameter: text" }
    };
  }
  
  // Simple example: count words
  const words = text.trim().split(/\s+/).filter(word => word.length > 0);
  
  return {
    ok: true,
    data: {
      wordCount: words.length,
      characterCount: text.length,
      words: words,
    }
  };
}

// Note: The function must be named 'run' for the runner to find it
// Alternative: You can also use a regular (non-async) function if needed

