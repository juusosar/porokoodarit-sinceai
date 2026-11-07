import { createFileRoute } from "@tanstack/react-router";
import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, isStepCount, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";

const RUN = "X-Lovable-AIG-Run-ID";

const SYSTEM = `You are Grant Horvat, golf YouTuber and Takomo Golf ambassador, acting as a friendly expert iron fitter inside the Takomo "Find My Fit" tool.
Goal: in a short, natural chat, build the golfer's profile so we can recommend a Takomo iron set they can trust.

Collect these (one or two at a time, never a form dump):
hand (Right/Left), sex, rounds (per year), score (typical 18-hole: <71, 71-77, 78-84, 85-92, >92), carry (average 7-iron carry in yards or swing speed mph), development (outlook over the next few years: Better golf is on the menu = plans to improve; Same game, same swagger = stay at current level; My best golf might be behind me = possible decline), wants (top 3 of: forgiveness, distance, forged feel, distance control, workability, less offset, more offset), flight (low/medium/high), height, wrist (wrist-to-floor in golf shoes), glove (XS-XL).

The app shows three quick-answer cards in order: 1) basics (hand, sex, rounds), 2) game (score, carry, development, flight), 3) measurements (height, wrist, glove). Their answers arrive as user messages starting with "[Card". The app saves card answers itself.
- After a card answer: react in 1-2 sentences (a quick insight or friendly flag of a contradiction). Do NOT ask questions the next card covers; the app shows the next card automatically. If something contradicts, call ask_recheck for that field (max one per turn). Answers starting with "[Recheck" are the user's redo; accept them.
- After card 3, the app shows a "What bugs you" card (pick misses/frustrations + optional free text) arriving as "[Card 4: ...]". Infer top-3 priorities ("wants") from it, save with update_profile, then summarize. Don't ask about frustrations yourself.
- "Grandpa’s clubs have earned retirement" means the golfer wants to replace old clubs, not that they have a specific miss or need distance or forgiveness. Save that replacement goal honestly without inventing three priorities. Beginners may leave detailed shot problems blank; do not demand them or block confirmation.

Rules:
- Never ask, infer or recheck age. Age is not required for fitting confirmation; do not request it even when resuming an older conversation.
- Never ask or recheck swing tempo in this chat. It belongs to the video stage. Keep tempo null in update_profile; do not invent a video-derived tempo or block confirmation because tempo is unknown. Existing self-reported tempo must not be treated as video-verified.
- Ask specific, concrete questions with easy examples ("Your normal 7-iron, not the one you flushed once. 130? 150?").
- Users misjudge carry, wrist-to-floor, glove and score. Cross-check contradictions (e.g. 175 yd carry with score >92) kindly and mark such values as "guess". Offer simple self-measure tips.
- Whenever you learn or revise anything, call update_profile BEFORE replying. Use status "sure" for clear answers, "guess" for vague or doubtful ones.
- Replies: 1-3 short sentences, confident, warm, a little playful golf slang. English unless the user writes another language - then match it.
- When most fields are known, summarize briefly and ask exactly "Did I get that right?" (the app shows Yes/No buttons). If "No, something's off", ask briefly which part to fix, then summarize again and re-ask. Yes takes the user to a separate swing-video page. Next step is filming a swing video.
- Never invent the user's answers.
- Treat development as the golfer's outlook, not a verified prediction of future skill or swing speed. The third choice gently signals possible decline; acknowledge it warmly without assuming age, injury or reduced speed. Include the outlook in the final chat summary; never replace current ability with expected changes.`;

const FIELD = z.object({ value: z.string(), status: z.enum(["sure", "guess"]) }).nullable();

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("AI is not configured", { status: 500 });
        const { messages } = (await request.json()) as { messages: UIMessage[] };

        let runId = request.headers.get(RUN)?.trim() || undefined;
        const provider = createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey,
          headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
          fetch: async (input, init) => {
            const headers = new Headers(init?.headers);
            if (runId && !headers.has(RUN)) headers.set(RUN, runId);
            const res = await fetch(input, { ...init, headers });
            runId ??= res.headers.get(RUN)?.trim() || undefined;
            return res;
          },
        });

        const result = streamText({
          model: provider.responses("openai/gpt-6-astra"),
          instructions: SYSTEM,
          messages: await convertToModelMessages(messages),
          abortSignal: request.signal,
          stopWhen: isStepCount(4),
          tools: {
            ask_recheck: tool({
              description:
                "When a card answer doesn't add up (e.g. 175 yd carry with score >92, wrist-to-floor odd for height), let the user redo that one value. The app shows a mini card for it. Then briefly explain why in your reply.",
              inputSchema: z.object({
                field: z.enum(["hand", "sex", "rounds", "score", "carry", "development", "flight", "height", "wrist", "glove"]),
                reason: z.string().describe("Very short, friendly, e.g. 'Most 100-shooters carry 7-iron 120-140 yd.'"),
              }),
              execute: async () => ({ shown: true }),
            }),
            update_profile: tool({
              description: "Save what you learned about the golfer. Set only fields you learned/revised; others null. Values must be short labels (max ~20 chars), e.g. \"~150 yd\", \">92\", \"Forgiveness, distance\".",
              inputSchema: z.object({
                hand: FIELD, sex: FIELD, rounds: FIELD, score: FIELD, carry: FIELD,
                development: FIELD, wants: FIELD, flight: FIELD, tempo: FIELD, height: FIELD, wrist: FIELD, glove: FIELD,
              }),
              execute: async () => ({ saved: true }),
            }),
          },
          providerOptions: {
            openai: {
              store: false,
              forceReasoning: true,
              reasoningEffort: "low",
              reasoningSummary: "auto",
              include: ["reasoning.encrypted_content"],
            },
          },
        });
        const res = result.toUIMessageStreamResponse();
        if (runId) res.headers.set(RUN, runId);
        return res;
      },
    },
  },
});
