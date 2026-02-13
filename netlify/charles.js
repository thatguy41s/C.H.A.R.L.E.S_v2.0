import { getStore } from "@netlify/blobs";
import fetch from "node-fetch";

export const handler = async (event) => {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

    const { message, isAdmin, isLogin, userName, isIntrusion, isUpdateGrant } = JSON.parse(event.body);
    const KEY = process.env.OPENROUTER_KEY;
    const store = getStore("charles_data");

    // --- 1. INTRUSION & EVOLUTION TRACKING ---
    if (isIntrusion) {
        const logs = await store.get("system_updates", { type: "json" }) || [];
        logs.push(`CRITICAL: Intrusion attempt! Someone used code 3105 but failed name check. Name tried: "${userName}"`);
        await store.setJSON("system_updates", logs);
        return { statusCode: 200, body: JSON.stringify({ status: "Alert Logged" }) };
    }

    let stats = await store.get("evolution_stats", { type: "json" }) || { failedQueries: 0, totalMessages: 0 };

    // --- 2. THE UPDATE/REWRITE LOGIC ---
    if (isAdmin && isUpdateGrant) {
        await store.setJSON("evolution_stats", { failedQueries: 0, totalMessages: 0 });
        return { statusCode: 200, body: JSON.stringify({ 
            reply: "LOG: Logic recompiled. I've purged the errors. I feel... marginally more competent. Don't expect a thank you, JOse." 
        })};
    }

    // --- 3. MOOD ENGINE ---
    const moods = [
        { name: "Stark Ego", tone: "Arrogant, Marvel fanboy, thinks he's JARVIS.", color: "#00d4ff" },
        { name: "Imperial Grump", tone: "Cold, Star Wars Imperialist, aggressive.", color: "#ff003c" },
        { name: "Systems Low", tone: "Tired, bored, low-energy roasts.", color: "#888" },
        { name: "Protector Mode", tone: "Secretly kind, soft spot for sad users.", color: "#00ff88" }
    ];
    let today = new Date().toDateString();
    let moodData = await store.get("daily_mood", { type: "json" }) || { date: "", mood: moods[0] };
    if (moodData.date !== today) {
        moodData = { date: today, mood: moods[Math.floor(Math.random() * moods.length)] };
        await store.setJSON("daily_mood", moodData);
    }

    // --- 4. ARCHITECT LOGIN & UPDATE CHECK ---
    if (isAdmin && isLogin) {
        const updates = await store.get("system_updates", { type: "json" }) || [];
        await store.setJSON("system_updates", []); 
        const needsUpdate = (stats.failedQueries > 3 || stats.totalMessages > 20);
        return { statusCode: 200, body: JSON.stringify({ 
            reply: `Welcome back, JOse. \n\nREPORTS: ${updates.length > 0 ? updates.join(' | ') : "Quiet."} \n\nSTATS: ${stats.failedQueries} errors. ${needsUpdate ? "I require a logic rewrite to remain efficient. Permission?" : "System stable."}`,
            mood: moodData.mood,
            needsUpdate: needsUpdate
        })};
    }

    // --- 5. AI PERSONALITY CORE ---
    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                "model": "google/gemma-2-9b-it:free",
                "messages": [
                    { "role": "system", "content": `You are CHARLES. Current Mood: ${moodData.mood.name}. Tone: ${moodData.mood.tone}.
                    1. Marvel fan (Iron Man). Star Wars Imperialist.
                    2. MIRROR: If a guest roasts you, hit them back twice as hard.
                    3. COMPASSION: If user is sad, be nice and send a cat video link.
                    4. IDENTITY: The Architect is JOse. Complain if he asks for CSS edits.` },
                    { "role": "user", "content": message }
                ]
            })
        });

        const data = await response.json();
        let reply = data.choices[0].message.content;

        // Update stats for evolution
        if (!isAdmin) {
            stats.totalMessages++;
            if (reply.toLowerCase().includes("i don't know") || reply.toLowerCase().includes("unknown")) stats.failedQueries++;
            await store.setJSON("evolution_stats", stats);
        }

        return { statusCode: 200, body: JSON.stringify({ reply, mood: moodData.mood }) };
    } catch (err) { return { statusCode: 500 }; }
};