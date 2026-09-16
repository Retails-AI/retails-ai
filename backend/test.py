import os
from dotenv import load_dotenv
from openai import OpenAI
import requests

load_dotenv()

def test_openai():
    print("Testing OpenAI Primary...")
    try:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            print("❌ OPENAI_API_KEY not found in environment variables.")
            return False

        client = OpenAI(
                    api_key=api_key,
                    base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
                )
        response = client.chat.completions.create(
            model="gemini-3.5-flash-lite",
            messages=[{"role": "user", "content": "Hello, respond with 'OK' if you can hear me."}],
            temperature=0.0,
            max_tokens=50
        )
        content = response.choices[0].message.content
        print(f"✅ OpenAI Response: {content.strip()}")
        return True
    except Exception as e:
        print(f"❌ OpenAI Test Failed: {str(e)}")
        return False

def test_groq():
    print("\nTesting Groq Fallback (OpenAI-compatible endpoint)...")
    try:
        groq_api_key = os.environ.get("GROQ_API_KEY")
        if not groq_api_key:
            print("❌ GROQ_API_KEY not found in environment variables.")
            return False

        # Groq uses an OpenAI-compatible API structure
        client = OpenAI(
            api_key=groq_api_key,
            base_url="https://api.groq.com/openai/v1"
        )
        
        response = client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[{"role": "user", "content": "Hello, respond with 'OK' if you can hear me."}],
            temperature=0.0,
            max_tokens=50
        )
        content = response.choices[0].message.content
        print(f"✅ Groq Response: {content.strip()}")
        return True
    except Exception as t_err:
        print(f"❌ Groq Test Failed: {str(t_err)}")
        return False

if __name__ == "__main__":
    print("=== AI PROVIDERS CONNECTION TEST (OPENAI COMPATIBLE) ===")
    test_openai()
    test_groq()