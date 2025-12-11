/**
 * Example JavaScript tool
 * This shows how to write a tool that runs in the sandboxed JS runner
 */

// Export default async function
export default async function run(args) {
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

// Alternative: export named function
// export async function run(args) { ... }

// Alternative: CommonJS style
// module.exports = async function(args) { ... }

