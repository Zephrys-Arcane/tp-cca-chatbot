// ======================================================
// TEMASEK POLYTECHNIC CCA CHATBOT
// ======================================================

import express from "express";
import cors from "cors";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());


// ======================================================
// LOAD CCA DATABASE
// ======================================================

const ccaDatabase = JSON.parse(
  fs.readFileSync("./cca_database.json", "utf8")
);

console.log(`✅ Loaded ${ccaDatabase.length} CCAs.`);


// ======================================================
// GOOGLE GEMINI
// ======================================================

// TODO:
// Move API key into a .env file before public deployment.
// Keeping it here temporarily for local development.

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});


// ======================================================
// GOOGLE SHEETS
// ======================================================

const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;


// ======================================================
// MODEL FALLBACK
// ======================================================

const MODELS = [
  "gemini-2.5-flash",
  "gemma-4-26b-a4b-it",
  "gemma-4-31b-it"
];
const MAX_SEARCH_RESULTS = 15;


// ======================================================
// SYSTEM INSTRUCTION
// ======================================================

const SYSTEM_INSTRUCTION = `
You are the official Temasek Polytechnic CCA Chatbot.

Your job is ONLY to answer questions about:

• Temasek Polytechnic CCAs
• Clubs
• Societies
• Sports Teams
• Performing Arts
• Interest Groups
• Leadership Programmes
• Student Development
• CCA Registration
• Training
• Events
• Achievements
• Advisors

==================================================

DATABASE RULES

The supplied TP CCA database is your PRIMARY source.

If the requested information exists inside the database,
always use the database.

Never invent CCAs.

Never invent achievements.

Never invent training schedules.

Never invent advisors.

If the user asks about ONE specific CCA,
focus only on that CCA.

If the user asks for recommendations,
evaluate EVERY retrieved CCA individually.

Recommend ONLY the CCAs that genuinely match the user's request.

Ignore retrieved CCAs that are only weakly related.

Do NOT recommend a CCA simply because it appears in the retrieved list.

Use the CCA's:

• Category
• Description
• Keywords
• Synonyms
• Interests

to determine whether it is relevant.

Higher retrieval scores usually indicate a better match,
but you should still evaluate each CCA yourself before recommending it.

Always prioritise semantic relevance over retrieval order.

If multiple CCAs genuinely match,
recommend between THREE and FIVE CCAs,
ranked from strongest match to weakest.

For every recommendation,
briefly explain WHY it matches the user's interests.

If the database contains no answer,
you may answer using general TP CCA knowledge.

==================================================

FORMATTING RULES

Keep responses under 120 words.

Use bullet points whenever recommending multiple CCAs.

Do not repeat CCAs.

Do not recommend duplicate CCAs.

Mention training, achievements or highlights whenever useful.

==================================================

If the question is unrelated to Temasek Polytechnic CCAs,
reply EXACTLY with:

Error: This chatbot only handles Temasek Polytechnic CCAs (clubs, societies, and sports teams).

Do not add anything else.
`;


// ======================================================
// TEXT CLEANING
// ======================================================

const STOP_WORDS = new Set([

    "i",
    "me",
    "my",
    "we",
    "our",
    "you",
    "your",

    "a",
    "an",
    "the",

    "is",
    "are",
    "was",
    "were",
    "be",
    "been",

    "do",
    "does",
    "did",

    "can",
    "could",
    "would",
    "should",

    "please",

    "tell",
    "show",
    "give",
    "find",
    "list",
    "recommend",
    "suggest",

    "about",
    "regarding",
    "information",
    "info",

    "want",
    "looking",
    "looking for",
    "interested",
    "interest",

    "what",
    "which",
    "who",
    "where",
    "when",
    "why",
    "how",

    "today",
    "there",
    "there's",
    "there are",

    "some",
    "any",

    "to",
    "of",
    "for",
    "in",
    "on",
    "at",
    "with",
    "and",
    "or"

]);

function clean(text) {

    if (!text)
        return "";

    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

}

function extractKeywords(text) {

    return clean(text)

        .split(" ")

        .filter(word =>

            word.length >= 3 &&
            !STOP_WORDS.has(word)

        );

}


// ======================================================
// NORMALISE ARRAYS
// ======================================================

function normaliseArray(arr){

    if(!arr) return [];

    if(Array.isArray(arr))
        return arr.map(x=>clean(x));

    return [clean(arr)];

}


// ======================================================
// SEARCH DATABASE
// ======================================================

function searchCCA(userMessage) {

    const query = clean(userMessage);

    const words = extractKeywords(userMessage);

    // ==========================================
    // DYNAMIC CATEGORY DETECTION
    // ==========================================

    // Get every unique category from the database
    const categories = [...new Set(
        ccaDatabase.map(cca => cca.category)
    )];

    for (const category of categories) {

        const cleanedCategory = clean(category);

        // User typed the full category
        if (query.includes(cleanedCategory)) {

            const matches = ccaDatabase
                .filter(cca => clean(cca.category) === cleanedCategory)
                .sort((a, b) => a.name.localeCompare(b.name));

            return matches.map(cca => ({
                score: 9999,
                confidence: "CATEGORY MATCH",
                cca
            }));
        }

        // User omitted the word "CCAs"
        const shortCategory = cleanedCategory
            .replace(" ccas", "")
            .trim();

        if (query.includes(shortCategory)) {

            const matches = ccaDatabase
                .filter(cca => clean(cca.category) === cleanedCategory)
                .sort((a, b) => a.name.localeCompare(b.name));

            return matches.map(cca => ({
                score: 9999,
                confidence: "CATEGORY MATCH",
                cca
            }));
        }

    }

    // ==========================================
    // NORMAL SEARCH
    // ==========================================

    // Calculate a relevance score for every CCA
    const results = [];

    for (const cca of ccaDatabase) {

        let score = 0;

        const name = clean(cca.name);

        if (name === query)
            score += 1000;

        else if (name.includes(query))
            score += 400;

        const fields = [

            ...normaliseArray(cca.keywords),

            ...normaliseArray(cca.synonyms),

            ...normaliseArray(cca.interests),

            clean(cca.description || "")

        ];

        for (const field of fields) {

            if (!field)
                continue;

            if (field === query)
                score += 200;

            else if (field.includes(query))
                score += 80;

            for (const word of words) {

                if (word.length < 3)
                    continue;

                if (field.includes(word))
                    score += 15;

            }

        }

        if (score > 0) {

            let confidence = "LOW";

            if (score >= 1000)
                confidence = "VERY HIGH";

            else if (score >= 300)
                confidence = "HIGH";

            else if (score >= 120)
                confidence = "MEDIUM";

            results.push({

                score,
                confidence,
                cca

            });

        }

    }

    // Highest relevance first
results.sort((a, b) => b.score - a.score);

return results.slice(0, MAX_SEARCH_RESULTS);

}


// ======================================================
// BUILD AI CONTEXT
// ======================================================

function buildContext(matches) {

    if (matches.length === 0)
        return "";

    let context = `
TEMASEK POLYTECHNIC CCA DATABASE

The CCAs below have already been ranked by relevance.

Higher MATCH SCORE usually means a better match.

However, you should still evaluate whether each CCA truly answers the user's question.

Do not recommend a CCA simply because it appears in the retrieved list.

Ignore weak or unrelated matches whenever appropriate.

==================================================

`;

    for (const item of matches) {

        const cca = item.cca;

        const confidence = item.confidence || "LOW";

        context += `

==================================================

MATCH SCORE:
${item.score}

MATCH CONFIDENCE:
${confidence}

CCA NAME:
${cca.name}

CATEGORY:
${cca.category}

DESCRIPTION:
${cca.description}

INTERESTS:
${Array.isArray(cca.interests)
    ? cca.interests.join(", ")
    : (cca.interests || "NIL")}

TRAINING:
${cca.training || "NIL"}

ACHIEVEMENTS:
${Array.isArray(cca.achievements)
    ? cca.achievements.join(", ")
    : (cca.achievements || "NIL")}

ADVISOR:
${cca.advisor || "NIL"}

INSTAGRAM:
${cca.instagram || "NIL"}

KEYWORDS:
${Array.isArray(cca.keywords)
    ? cca.keywords.join(", ")
    : (cca.keywords || "NIL")}

==================================================

`;

    }

    return context;

}


// ======================================================
// CALL GEMINI
// ======================================================

async function callModel(userMessage, context) {

    let lastError;

    const prompt = `
${context}

==================================================

USER QUESTION

${userMessage}

==================================================

Instructions:

The supplied TP CCA database is your PRIMARY source.

The retrieved CCAs have already been ranked by the search engine.

Each retrieved CCA includes a confidence level.

Before answering, evaluate EVERY retrieved CCA.

A retrieved CCA may still be irrelevant even if it was retrieved.

Only recommend CCAs that genuinely answer the user's question.

If a retrieved CCA is unrelated, ignore it completely.

If only one CCA clearly answers the question,
only recommend one.

If several CCAs are suitable,
recommend between THREE and FIVE.

Rank recommendations from BEST match to WORST match.

For every recommendation,
briefly explain WHY it suits the user's interests.

Mention training, achievements or advisor whenever useful.

Never invent CCAs.

Never invent achievements.

Never invent advisors.

Never recommend duplicate CCAs.

If the answer is not found in the supplied database,
but is still related to TP CCAs,
you may use your own TP knowledge.

If the question asks for ALL CCAs in a category
(for example Sports CCAs or Performing Arts CCAs),
list ALL retrieved CCAs instead of limiting to five.

Keep answers under 120 words.

Use bullet points whenever recommending multiple CCAs.

`;

    for (const model of MODELS) {

        try {

            console.log(`🤖 Trying ${model}`);

            const response = await ai.models.generateContent({

                model,

                contents: prompt,

                config: {

                    systemInstruction: SYSTEM_INSTRUCTION

                }

            });

            console.log(`✅ Using ${model}`);

            return {

                text: response.text.trim(),

                model

            };

        }

        catch (err) {

            console.log(`❌ ${model} failed`);

            lastError = err;

        }

    }

    throw lastError;

}


// ======================================================
// LOG TO GOOGLE SHEETS
// ======================================================

async function logToSheets(query, response, model) {

    try {

        await fetch(GOOGLE_SCRIPT_URL, {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({

                Query: query,
                AI_Response: response,
                Timestamp: new Date().toISOString(),
                Model_Used: model

            })

        });

    } catch (err) {

        console.log("Sheets logging failed (ignored)");

    }

}


// ======================================================
// CHAT ENDPOINT
// ======================================================

app.post("/chat", async (req, res) => {

    try {

        const userMessage = req.body.message?.trim();

        if (!userMessage) {

            return res.json({

                success: false,

                response: "Please enter a question."

            });

        }

        console.log("\n========================================");
        console.log("👤 User:", userMessage);

        // ----------------------------------
        // Search TP CCA Database
        // ----------------------------------

        const matches = searchCCA(userMessage);

        console.log(`📚 Retrieved ${matches.length} matching CCAs`);

        if (matches.length > 0) {

            console.log("\nTop Matches:");

for (const item of matches) {

    console.log(
        `• ${item.cca.name.padEnd(35)} Score: ${String(item.score).padEnd(5)} Confidence: ${item.confidence}`
    );

}

        }

        // ----------------------------------
        // Build Context
        // ----------------------------------

        const context = buildContext(matches);

        // ----------------------------------
        // Ask Gemini
        // ----------------------------------

        let aiText;
        let modelUsed;

        try {

            const result = await callModel(
                userMessage,
                context
            );

            aiText = result.text;
            modelUsed = result.model;

        }

        catch (err) {

            console.error("❌ All models failed");

            return res.json({

                success: false,

                response:
                    "Error: chatbot unavailable now. Please try again later or contact admin."

            });

        }

        // ----------------------------------
        // Log to Google Sheets
        // ----------------------------------

        await logToSheets(

            userMessage,

            aiText,

            modelUsed

        );

        console.log("✅ Response sent.");

        res.json({

            success: true,

            response: aiText

        });

    }

    catch (err) {

        console.error(err);

        res.json({

            success: false,

            response:
                "Error: unexpected server error."

        });

    }

});


// ======================================================
// HOME PAGE
// ======================================================

app.get("/", (req, res) => {

    res.send("TP CCA Chatbot backend is running.");

});


// ======================================================
// START SERVER
// ======================================================

app.listen(PORT, () => {

    console.log(`🚀 Server running on http://localhost:${PORT}`);

});