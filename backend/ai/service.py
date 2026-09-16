import os
import json
from decimal import Decimal
from typing import List
from pydantic import BaseModel, Field
from openai import OpenAI
import requests
from reports.service import (
    get_financial_summary,
    get_transaction_counts,
    get_inventory_summary,
    get_trends,
    get_performance_metrics
)

class BusinessInsightsSchema(BaseModel):
    sales_performance_insight: str = Field(description="Short factual analysis of sales revenue and volume in INR (₹).")
    expense_insight: str = Field(description="Short factual analysis of operating expenses in INR (₹).")
    inventory_insight: str = Field(description="Short factual evaluation of stock levels and threshold units.")
    product_performance_insight: str = Field(description="Short summary of top-selling products.")
    overall_business_insight: str = Field(description="Short financial health summary including revenue, COGS, expenses, and net profit/loss in INR (₹).")
    actionable_recommendations: List[str] = Field(description="2 to 3 concise business recommendations.")

def serialize_for_ai(data):
    if isinstance(data, dict):
        return {k: serialize_for_ai(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [serialize_for_ai(item) for item in data]
    elif isinstance(data, Decimal):
        return float(data)
    elif hasattr(data, 'isoformat'):
        return data.isoformat()
    return data

def generate_business_insights():
    raw_metrics = {
        "financial_summary": get_financial_summary(),
        "transaction_counts": get_transaction_counts(),
        "inventory_summary": get_inventory_summary(threshold=10),
        "trends": get_trends(limit=7),
        "performance_metrics": get_performance_metrics()
    }
    
    clean_metrics = serialize_for_ai(raw_metrics)

    prompt = f"""
    Metrics:
    {json.dumps(clean_metrics)}

    Rules:
    - Use Indian Rupees (₹) for monetary values. Never use $.
    - Quantities and thresholds are physical units, never attach currency symbols.
    - Be extremely concise (1 short sentence or paragraph per field).
    - Do not output reasoning or chain-of-thought.
    """

    # Primary Model Attempt: Gemini
    try:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable is not configured.")

        client = OpenAI(
            api_key=api_key,
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
        )

        response = client.chat.completions.create(
            model="gemini-3.5-flash-lite",
            messages=[
                {"role": "system", "content": "You are a professional retail business assistant. Provide output matching the required format."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.0
        )

        content = response.choices[0].message.content
        result_obj = json.loads(content)
        result_obj["raw_metrics_snapshot"] = clean_metrics
        return result_obj

    except Exception as primary_error:
        print(f"⚠️ Primary Gemini AI failed ({str(primary_error)}). Switching to Fallback (Groq GPT-OSS 120B)...")
        
        # Fallback Model Attempt: Groq GPT-OSS 120B
        try:
            groq_api_key = os.environ.get("GROQ_API_KEY")
            if not groq_api_key:
                raise ValueError("GROQ_API_KEY environment variable is not configured for fallback.")

            url = "https://api.groq.com/openai/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {groq_api_key}",
                "Content-Type": "application/json"
            }

            fallback_prompt = prompt + """
            You must output ONLY valid JSON matching this exact schema keys:
            {
              "sales_performance_insight": "...",
              "expense_insight": "...",
              "inventory_insight": "...",
              "product_performance_insight": "...",
              "overall_business_insight": "...",
              "actionable_recommendations": ["...", "..."]
            }
            """

            payload = {
                "model": "openai/gpt-oss-120b",
                "messages": [
                    {
                        "role": "user",
                        "content": fallback_prompt
                    }
                ],
                "temperature": 0.0,
                "max_tokens": 2048
            }

            resp = requests.post(url, headers=headers, json=payload, timeout=15)
            if resp.status_code != 200:
                raise RuntimeError(f"Groq API error status {resp.status_code}: {resp.text}")

            res_data = resp.json()
            content = res_data.get('choices', [{}])[0].get('message', {}).get('content', '{}')
            
            # Clean potential markdown code block wrappers
            cleaned_content = content.strip()
            if cleaned_content.startswith("```json"):
                cleaned_content = cleaned_content[7:]
            if cleaned_content.startswith("```"):
                cleaned_content = cleaned_content[3:]
            if cleaned_content.endswith("```"):
                cleaned_content = cleaned_content[:-3]
            cleaned_content = cleaned_content.strip()

            result_obj = json.loads(cleaned_content)
            result_obj["raw_metrics_snapshot"] = clean_metrics
            return result_obj

        except Exception as fallback_error:
            raise RuntimeError(f"Both Primary (Gemini) and Fallback (Groq GPT-OSS 120B) AI generations failed. Primary error: {str(primary_error)} | Fallback error: {str(fallback_error)}")