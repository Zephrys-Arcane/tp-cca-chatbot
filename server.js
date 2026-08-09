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

// Serve HTML, CSS and JS files
app.use(express.static("."));


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

console.log("GOOGLE_SCRIPT_URL =", GOOGLE_SCRIPT_URL);


// ======================================================
// MODEL FALLBACK
// ======================================================

const MODELS = [
  "gemini-2.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
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
// RESOLVE FOLLOW-UP SEARCH QUERIES
// ======================================================

function resolveSearchQuery(userMessage, history) {

    const rawQuery = clean(userMessage);

    // No history → search normally
    if (!history || history.length === 0) {
        return userMessage;
    }

    // Words/phrases that usually indicate a follow-up question
    const followUpPatterns = [
        "they",
        "them",
        "their",
        "it",
        "this cca",
        "this club",
        "this team",
        "this group",
        "the above cca",
        "the same cca",
        "the above club",
        "the same club",
        "the above team",
        "the same team"
    ];

    const isFollowUp = followUpPatterns.some(pattern =>
        rawQuery.includes(pattern)
    );

    if (!isFollowUp) {
        return userMessage;
    }

    // Find the most recent assistant response
    // and previous user messages.
    const recentHistory = history.slice(-10);

    // Try to identify a CCA mentioned in the conversation.
    let referencedCCA = null;

    // Search newest messages first
    for (let i = recentHistory.length - 1; i >= 0; i--) {

        const message = recentHistory[i];

        if (!message?.content)
            continue;

        const messageText = clean(message.content);

        // Check database CCA names against the conversation
        for (const cca of ccaDatabase) {

            const ccaName = clean(cca.name);

            if (
                messageText.includes(ccaName)
            ) {

                referencedCCA = cca.name;
                break;

            }

        }

        if (referencedCCA)
            break;
    }

    // If we could not identify a CCA,
    // keep the original query.
    if (!referencedCCA) {
        return userMessage;
    }

    // Add the identified CCA to the search query.
    const resolvedQuery = referencedCCA;

    console.log(
        `🔎 Follow-up detected: "${userMessage}"`
    );

    console.log(
        `🎯 Resolved CCA: "${resolvedQuery}"`
    );

    return resolvedQuery;
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

    
const INTEREST_GROUPS = {

    active: [
        "soccer",
        "basketball",
        "dragon boat",
        "volleyball",
        "ultimate frisbee",
        "badminton",
        "rugby",
        "track & field",
        "kayak",
        "sport climbing"
    ],

    creative: [
        "band",
        "music vox",
        "chorale",
        "theatro",
        "dance",
        "design"
    ],

    technology: [
        "informatics",
        "creative tech",
        "engineering",
        "robotics",
        "coding"
    ],

    leadership: [
        "lead ambassadors",
        "students union",
        "toastmasters",
        "peer mentors"
    ],

    volunteering: [
        "senvocates",
        "lionhearters",
        "peer supporters",
        "red cross"
    ]

};


function isCategoryListing(query, category, shortCategory) {

    const listingPatterns = [

        // Exact category
        new RegExp(`^${category}$`, "i"),
        new RegExp(`^${shortCategory}$`, "i"),

        // Show/List commands
        new RegExp(
            `^(show|list|display)(\\s+me)?(\\s+the)?\\s+${shortCategory}(\\s+ccas?)?$`,
            "i"
        ),

        // What/Which commands
        new RegExp(
            `^(what|which|all)(\\s+are)?(\\s+the)?\\s+${shortCategory}(\\s+ccas?)?$`,
            "i"
        )

    ];

    return listingPatterns.some(pattern => pattern.test(query));

}


// ======================================================
// SEARCH DATABASE
// ======================================================

function searchCCA(userMessage) {

    const rawQuery = clean(userMessage);

    const words = extractKeywords(userMessage);

    const query = words.join(" ");

    const boostedKeywords = [];

    for (const word of words) {

        if (INTEREST_GROUPS[word]) {

         boostedKeywords.push(...INTEREST_GROUPS[word]);

        }

    }

    // ==========================================
    // DYNAMIC CATEGORY DETECTION
    // ==========================================

    const categories = [...new Set(
        ccaDatabase.map(cca => cca.category)
    )];

    for (const category of categories) {

        const cleanedCategory = clean(category);

        const shortCategory = cleanedCategory
            .replace(" ccas", "")
            .trim();

        // Only treat the query as a category listing
        // if the user is clearly asking to SEE/LIST the category.
        const isListingRequest =
            rawQuery === cleanedCategory ||
            rawQuery === shortCategory ||
            rawQuery === `${shortCategory} ccas` ||
            rawQuery === `show me ${shortCategory}` ||
            rawQuery === `show me ${shortCategory} ccas` ||
            rawQuery === `show ${shortCategory}` ||
            rawQuery === `show ${shortCategory} ccas` ||
            rawQuery === `list ${shortCategory}` ||
            rawQuery === `list ${shortCategory} ccas` ||
            rawQuery === `list all ${shortCategory}` ||
            rawQuery === `list all ${shortCategory} ccas` ||
            rawQuery === `what are the ${shortCategory} ccas` ||
            rawQuery === `what ${shortCategory} ccas are there` ||
            rawQuery === `which ${shortCategory} ccas are there`;

        if (isListingRequest) {

            const matches = ccaDatabase
                .filter(cca =>
                    clean(cca.category) === cleanedCategory
                )
                .sort((a, b) =>
                    a.name.localeCompare(b.name)
                );

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

    const results = [];

    for (const cca of ccaDatabase) {

        let score = 0;

        const name = clean(cca.name);

        const keywords = normaliseArray(cca.keywords);
        const synonyms = normaliseArray(cca.synonyms);
        const interests = normaliseArray(cca.interests);

        const description = clean(cca.description || "");

        const allFields = [
            ...keywords,
            ...synonyms,
            ...interests,
            description
        ];

        // ==========================================
        // EXACT CCA NAME MATCH
        // ==========================================

        if (name === query) {

            score += 1000;

        }

        // ==========================================
        // CCA NAME CONTAINS FULL QUERY
        // ==========================================

        else if (name.includes(query)) {

            score += 500;

        }

        // ==========================================
        // EXACT KEYWORD / SYNONYM MATCH
        // ==========================================

        if (keywords.includes(query)) {

            score += 300;

        }

        if (synonyms.includes(query)) {

            score += 220;

        }

        if (interests.includes(query)) {

            score += 180;

        }

        // ==========================================
        // FULL PHRASE MATCH
        // ==========================================

        for (const field of allFields) {

            if (!field)
                continue;

            if (field === query) {

                score += 250;

            }

            else if (field.includes(query)) {

                score += 100;

            }

        }

        // ==========================================
        // INDIVIDUAL WORD MATCHING
        // ==========================================

        for (const word of words) {

            if (word.length < 3)
                continue;

            // Ignore very generic words when scoring
            const genericWords = new Set([
                "sports",
                "sport",
                "club",
                "clubs",
                "games",
                "game",
                "team",
                "teams",
                "cca",
                "ccas",
                "activity",
                "activities"
            ]);

            const wordIsGeneric = genericWords.has(word);

            for (const field of allFields) {

                if (!field)
                    continue;

                if (field === word) {

                    score += wordIsGeneric ? 5 : 25;

                }

                else if (field.includes(word)) {

                    score += wordIsGeneric ? 3 : 12;

                }

            }

        }

        // ==========================================
        // INTEREST GROUP BOOST
        // ==========================================

        for (const boost of boostedKeywords) {

            for (const field of allFields) {

                if (field.includes(boost)) {

                    score += 80;

                }

            }

        }

        // ==========================================
        // ADD RESULT
        // ==========================================

        if (score > 0) {

            let confidence = "LOW";

            if (score >= 1000)
                confidence = "VERY HIGH";

            else if (score >= 500)
                confidence = "HIGH";

            else if (score >= 200)
                confidence = "MEDIUM";

            results.push({

                score,
                confidence,
                cca

            });

        }

    }

    // ==========================================
    // SORT RESULTS
    // ==========================================

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

async function callModel(userMessage, context, history) {

    let lastError;

    // Convert conversation history into text
    const conversationHistory = history
        .map(msg => `${msg.role}: ${msg.content}`)
        .join("\n");

    const prompt = `
${context}

==================================================

CONVERSATION HISTORY

${conversationHistory || "No previous conversation."}

==================================================

IMPORTANT CONVERSATION MEMORY RULES

Use the conversation history to understand what the user is referring to.

If the user's current question is a follow-up to an earlier message,
use the previous conversation to resolve references such as:

• they
• them
• their
• it
• this CCA
• this club
• this team
• the above CCA
• the same CCA

For example:

User: Tell me about Mind Sports.
Assistant: [response about Mind Sports]
User: When do they train?

In this example, "they" refers to Mind Sports.

Do NOT assume that the highest-ranked search result is the CCA
the user is referring to.

The search results are supporting information only.
The conversation history should be used to determine the user's intent
and the subject of a follow-up question.

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

            console.error(`❌ ${model} failed`);

            console.error(`   Status: ${err.status || "Unknown"}`);

            console.error(`   Error: ${err.message || err}`);

            lastError = err;

        }

    }

    throw lastError;

}


// ======================================================
// LOG TO GOOGLE SHEETS
// ======================================================

async function logToSheets(query, response, model = "N/A") {

    try {

        console.log("📤 Sending log to Google Sheets...");
        console.log("URL:", GOOGLE_SCRIPT_URL);

        const res = await fetch(GOOGLE_SCRIPT_URL, {

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

        console.log("Google Script status:", res.status);

        const text = await res.text();

        console.log("Google Script response:", text);

    } catch (err) {

        console.error("❌ Sheets logging failed:");
        console.error(err);

    }

}


// ======================================================
// CHAT ENDPOINT
// ======================================================

app.post("/chat", async (req, res) => {

    try {

        const userMessage = req.body.message?.trim();
        const history = req.body.history || [];

        if (!userMessage) {

    const reply = "Please enter a question.";

    await logToSheets(
        "(Empty Message)",
        reply,
        "Validation Error"
    );

    return res.json({

        success: false,

        response: reply

    });

}

        console.log("\n========================================");
        console.log("👤 User:", userMessage);

        // ----------------------------------
        // Handle Casual Greetings
        // ----------------------------------

        const greetingPattern = /^(hi|hello|hey|hiya|howdy|good morning|good afternoon|good evening)[!.?,\s]*$/i;

        if (greetingPattern.test(userMessage)) {

        const reply =
            "Hi! 👋 I'm the Temasek Polytechnic CCA Chatbot. How can I help you today? You can ask me about TP CCAs, clubs, societies, sports teams, training, achievements, or recommendations.";

        await logToSheets(
            userMessage,
            reply,
            "Greeting"
        );

        return res.json({

            success: true,
            response: reply

        });

    }
        // ----------------------------------
        // Handle Casual Thanks
        // ----------------------------------

        const thanksPattern = /^(thanks|thank you|thanks a lot|thank you so much)[!.?,\s]*$/i;

        if (thanksPattern.test(userMessage)) {

    const reply =
        "You're welcome! 😊 Let me know if you'd like to know more about any Temasek Polytechnic CCA.";

    await logToSheets(
        userMessage,
        reply,
        "Thanks"
    );

    return res.json({

        success: true,

        response: reply

    });

}


        // ----------------------------------
        // Handle Casual Goodbyes
        // ----------------------------------

        const goodbyePattern = /^(bye|goodbye|see you|see you later)[!.?,\s]*$/i;

        if (goodbyePattern.test(userMessage)) {

    const reply =
        "Goodbye! 👋 Good luck finding a CCA that's right for you!";

    await logToSheets(
        userMessage,
        reply,
        "Goodbye"
    );

    return res.json({

        success: true,

        response: reply

    });

}


        // ----------------------------------
        // Handle Help Questions
        // ----------------------------------

        const helpPattern = /^(help|what can you do|what can you help me with)[!.?,\s]*$/i;

        if (helpPattern.test(userMessage)) {

    const reply =
        "I can help you explore Temasek Polytechnic CCAs! You can ask me about sports, clubs, societies, performing arts, training schedules, achievements, advisors, or ask me to recommend a CCA for you.";

    await logToSheets(
        userMessage,
        reply,
        "Help"
    );

    return res.json({

        success: true,

        response: reply

    });

}


        // ----------------------------------
        // Search TP CCA Database
        // ----------------------------------

        const searchQuery = resolveSearchQuery(
            userMessage,
            history
        );

        console.log(`🔍 Search Query: ${searchQuery}`);

        const matches = searchCCA(searchQuery);

// ----------------------------------
// Handle Category Listings
// ----------------------------------

if (
    matches.length > 0 &&
    matches[0].confidence === "CATEGORY MATCH"
) {

    const category = matches[0].cca.category;

    console.log(
        `📚 Retrieved ${matches.length} CATEGORY MATCHES`
    );

    console.log(`📂 Category: ${category}`);

    for (const item of matches) {

        console.log(
            `• ${item.cca.name}`
        );

    }

    const list = matches
        .map(item => `- ${item.cca.name}`)
        .join("\n");

    const reply =
`Temasek Polytechnic offers the following ${category}:

${list}`;

await logToSheets(
    userMessage,
    reply,
    "Category Listing"
);

return res.json({

    success: true,
    response: reply

});

}

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
                context,
                history
            );

            aiText = result.text;
            modelUsed = result.model;

        }

        catch (err) {

            console.error("❌ All models failed");

            console.error(
                `Final error: ${err?.message || err}`
            );

            console.error(
                `Status: ${err?.status || "Unknown"}`
            );

            const reply =
    "Error: chatbot unavailable now. Please try again later or contact admin.";

await logToSheets(
    userMessage,
    reply,
    "AI Failure"
);

return res.json({

    success: false,

    response: reply

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

    const reply =
        "Error: unexpected server error.";

    await logToSheets(
        userMessage || "(Unknown)",
        reply,
        "Server Error"
    );

    res.json({

        success: false,

        response: reply

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