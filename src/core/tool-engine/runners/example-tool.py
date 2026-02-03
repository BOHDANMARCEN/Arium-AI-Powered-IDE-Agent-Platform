"""
Example Python tool
This shows how to write a tool that runs in the sandboxed Python runner
"""

def run(args):
    """
    Tool function that processes arguments and returns result
    
    Args:
        args: Dictionary with tool arguments
        
    Returns:
        Dictionary with 'ok' (bool) and 'data' or 'error' fields
    """
    text = args.get("text", "")
    
    if not text:
        return {
            "ok": False,
            "error": {"message": "Missing required parameter: text"}
        }
    
    # Simple example: count words
    words = [w for w in text.strip().split() if w]
    
    return {
        "ok": True,
        "data": {
            "wordCount": len(words),
            "characterCount": len(text),
            "words": words[:10]  # First 10 words
        }
    }

# Alternative: use default name
# def default(args):
#     return run(args)

