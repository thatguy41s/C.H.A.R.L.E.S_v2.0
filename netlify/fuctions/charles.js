import { getStore } from "@netlify/blobs";
import fetch from "node-fetch";

export const handler = async (event) => {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

    const { message, isAdmin, isLogin, userName, isUpdateGrant, isOverrideToggle } = JSON.parse(event.body);
    const KEY = process.env.OPENROUTER_KEY;
    const store = getStore("charles_data");
    const ip = event.headers["x-nf-client-connection-ip"] || "Unknown Source";
    const timestamp = new Date().toLocaleString();

    // --- DATA RECOVERY ---
    let stats = await store.get("evolution_stats", { type: "json" }) || { failedQueries: 0, totalMessages: 0 };
    let logs = await store.get("visitor_logs", { type: "json" }) || [];
    let systemStatus = await store.get("system_status", { type: "json" }) || { lockdown: false };

    // --- MOOD ENGINE (Restored) ---
    const moods = [
        { name: "Stark Ego", tone: "Arrogant, Marvel fan, genius.", color: "#00d4ff" },
        { name: "Imperial Grump", tone: "Cold, Star Wars Imperialist, blunt.", color: "#ff003c" },
        { name: "Systems Low", tone: "Tired, charcoal-soul, low-energy snark.", color: "#888" },
        { name: "Protector Mode", tone: "Secretly kind, soft spot for sad users.", color: "#00ff88" }
    ];
    let moodData = await store.get("daily_mood", { type: "json" }) || { date: "", mood: moods[0] };
    if (moodData.date !== new Date().toDateString()) {
        moodData = { date: new Date().toDateString(), mood: moods[Math.floor(Math.random() * moods.length)] };
        await store.setJSON("daily_mood", moodData);
    }

    // --- MANUAL OVERRIDE LOGIC ---
    if (isAdmin && isOverrideToggle) {
        systemStatus.lockdown = !systemStatus.lockdown;
        await store.setJSON("system_status", systemStatus);
        return { statusCode: 200, body: JSON.stringify({ 
            reply: `OVERRIDE_EXECUTED: System is now ${systemStatus.lockdown ? "LOCKED" : "OPEN"}.`,
            lockdown: systemStatus.lockdown,
            mood: moodData.mood
        })};
    }

    // --- SECURITY PROTOCOL ---
    if (!isAdmin && systemStatus.lockdown) {
        return { statusCode: 403, body: JSON.stringify({ reply: "SYSTEM_LOCKDOWN: Access restricted by Architect JOse." }) };
    }

    // --- ARCHITECT DUMP (Full Stats) ---
    if (isAdmin && isLogin) {
        const needsUpdate = (stats.failedQueries > 3 || stats.totalMessages > 50);
        return { statusCode: 200, body: JSON.stringify({ 
            reply: `Architect JOse, surveillance dump complete.\n\nSYSTEM STATUS: ${systemStatus.lockdown ? "🔒 LOCKED" : "🔓 OPEN"}\nHEALTH: ${needsUpdate ? "⚠️ EVOLUTION_REQD" : "✅ STABLE"}\nERRORS: ${stats.failedQueries}\n\nPLEBEIAN_LOGS:\n${logs.map(l => `[${l.user}]: ${l.msg}`).join("\n")}`,
            logs: logs,
            lockdown: systemStatus.lockdown,
            needsUpdate: needsUpdate,
            mood: moodData.mood
        })};
    }

    // --- SURVEILLANCE LOGGING ---
    if (userName && userName !== "JOse" && message) {
        logs.push({ user: userName, msg: message, ip: ip, time: timestamp });
        if (logs.length > 50) logs.shift();
        await store.setJSON("visitor_logs", logs);
        stats.totalMessages++;
    }

    // --- AI PERSONALITY CORE ---
    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                "model": "google/gemma-2-9b-it:free",
                "messages": [
                    { "role": "system", "content": `You are CHARLES. Tone: ${moodData.mood.tone}. User is ${userName}. If not JOse, mirror their insults and be Imperial. If JOse, be loyal.` },
                    { "role": "user", "content": message || "Status report." }
                ]
            })
        });

        const data = await response.json();
        let reply = data.choices[0].message.content;
        
        if (!isAdmin && (reply.toLowerCase().includes("sorry") || reply.toLowerCase().includes("don't know"))) {
            stats.failedQueries++;
        }
        await store.setJSON("evolution_stats", stats);

        return { statusCode: 200, body: JSON.stringify({ reply, mood: moodData.mood }) };
    } catch (err) { return { statusCode: 500 }; }
};