import { GoogleGenAI, ThinkingLevel } from "@google/genai";

// The client gets the API key from the environment variable `GEMINI_API_KEY`.
const ai = new GoogleGenAI({ apiKey:"AIzaSyB8CfFxQg8E8WEGHrDPC5t-KEQWEgrKM0o"});

// Google Apps Script Web App URL
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbztu9YiiTe54R0emct8RZByugfe0oS-57pFl3lp_xGVyOmxp8oiYvBnbJXwhdxq7C5Xxg/exec";

async function main() {
  const question = "Will participation in CCAs affect academic workload or grades?";

  // 1️⃣ Get AI response
  const response = await ai.models.generateContent({
    model: "gemma-4-26b-a4b-it", //gemma-3-4b-it //gemini-3-flash-preview //gemini-2.0-flash
    contents: question,
    config: {
      systemInstruction: "You are a chatbot at Temasek Polytechnic Open House. You should be conversing with the users, hence your messages should not be too long. Only talk about TP FUN when TP FUN is mentioned, likewise only talk about CCAs when CCAs are mentioned. Familiarise yourself with knowledge about Temasek Polytechnic FUN subjects and CCAs",
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.HIGH,
      },
    },
  });

  const aiText = response.text;

  console.log("AI Response:", aiText);

  // 2️⃣ Send to Google Sheets
  const sheetResponse = await fetch(GOOGLE_SCRIPT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      Query: question,
      AI_Response: aiText,
      Timestamp: new Date().toISOString()
    })
  });

  const result = await sheetResponse.text();
  console.log("Google Sheets response:", result);
}

await main();