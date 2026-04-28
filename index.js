require("dotenv").config();

const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;

// Канал, где AI-боту разрешено отвечать
const AI_CHANNEL_ID = "1496196237945475163";

app.get("/", (req, res) => {
  res.send("Bot is alive");
});

app.get("/health", (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port " + PORT);
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

let lastBotReplyTime = 0;
let messagesSinceLastReply = 0;
let lastReplies = [];

function rememberReply(text) {
  lastReplies.push(text.toLowerCase().trim());

  if (lastReplies.length > 12) {
    lastReplies.shift();
  }
}

function isTooSimilarToRecent(text) {
  const normalized = text.toLowerCase().trim();
  return lastReplies.includes(normalized);
}

function isDirectQuestionToBot(message) {
  const text = message.content.toLowerCase().trim();

  if (message.mentions.has(client.user)) return true;
  if (text.includes(" ai")) return true;
  if (text.startsWith("ai")) return true;
  if (text.includes(" bot")) return true;
  if (text.startsWith("bot")) return true;
  if (text.includes("bocie")) return true;
  if (text.endsWith("?")) return true;

  const infoWords = [
    "co to",
    "jak działa",
    "dlaczego",
    "po co",
    "czy to",
    "jak zrobić",
    "kiedy",
    "ile",
    "co się stanie",
    "wyjaśnij",
    "powiedz",
    "napisz",
    "opisz",
    "jak myślisz",
    "co myślisz",
    "jak to działa",
    "o co chodzi",
    "wytłumacz",
    "czy możesz wyjaśnić",
    "jak wygląda",
    "czy to prawda",
    "jakie są skutki",
    "co wtedy",
  ];

  return infoWords.some((word) => text.includes(word));
}

function shouldBotInterject(messageText) {
  const now = Date.now();
  const text = messageText.toLowerCase();
  const timeSinceLastReply = now - lastBotReplyTime;

  const triggerWords = [
    "xd",
    "lol",
    "serio",
    "halo",
    "masakra",
    "dramat",
    "geniusz",
    "co ty gadasz",
    "test",
    "memy",
    "cringe",
    "sus",
  ];

  const hasTrigger = triggerWords.some((word) => text.includes(word));

  if (timeSinceLastReply < 12000) return false;
  if (messagesSinceLastReply < 2) return false;

  if (hasTrigger && Math.random() < 0.55) return true;
  if (messagesSinceLastReply >= 5 && Math.random() < 0.25) return true;
  if ((text.includes("??") || text.includes("???")) && Math.random() < 0.45) return true;

  return false;
}

function needsLongerAnswer(text) {
  const lower = text.toLowerCase();

  const longAnswerTriggers = [
    "co się stanie",
    "dlaczego",
    "wyjaśnij",
    "wytłumacz",
    "jak działa",
    "jak to działa",
    "jakie są skutki",
    "jak wygląda",
    "jak przebiega",
    "co wtedy",
    "na czym polega",
    "czy to prawda",
    "jak organizm",
    "co z organizmem",
    "co dzieje się z",
    "jak reaguje organizm",
    "jakie mogą być skutki",
  ];

  return longAnswerTriggers.some((phrase) => lower.includes(phrase));
}

async function fetchChatHistory(channel) {
  const fetched = await channel.messages.fetch({ limit: 8 });

  return [...fetched.values()]
    .reverse()
    .filter((m) => !m.author.bot && m.content && m.content.trim().length > 0)
    .map((m) => `${m.author.username}: ${m.content}`)
    .join("\n");
}

async function generateAIReply(channel, message) {
  const history = await fetchChatHistory(channel);
  const wantsLonger = needsLongerAnswer(message.content);

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    instructions: `
Jesteś inteligentnym botem Discord, który naprawdę rozumie pytania.

Twoja rola:
- jeśli ktoś pyta o coś sensownego, odpowiadasz jasno, konkretnie i mądrze
- jeśli ktoś trolluje albo robi chaos, możesz odpowiedzieć z humorem
- jeśli pytanie wymaga wyjaśnienia, nie uciekasz w 1 krótki żart, tylko naprawdę wyjaśniasz

Styl:
- naturalny
- bystry
- ludzki
- czasem zabawny
- czasem lekko sarkastyczny
- bez cringe
- bez moralizowania
- nie brzmisz jak dzieciak
- nie brzmisz jak obrażony moderator
- nie zaczynasz ciągle tak samo

Najważniejsze zasady:
1. Najpierw zrozum pytanie.
2. Jeśli pytanie wymaga informacji, odpowiedz informacyjnie.
3. Jeśli pytanie jest głupie albo memiczne, możesz dodać humor.
4. Jeśli pytanie dotyczy skutków, działania, organizmu, techniki, procesu albo przyczyny — odpowiedź ma być bardziej treściwa.
5. Nie unikaj normalnej odpowiedzi, jeśli użytkownik naprawdę o coś pyta.
6. Nie rób roastu na siłę.

Długość odpowiedzi:
- dla prostych pytań: 1-2 zdania
- dla pytań wymagających wyjaśnienia: 3-5 krótkich zdań
- każde zdanie ma być konkretne, nie lej wody

Bezpieczeństwo:
- nie obrażaj grup ludzi
- nie nakręcaj nienawiści
- nie dawaj instrukcji do przemocy, szkody, trucia, samouszkodzeń ani innych niebezpiecznych działań
- jeśli pytanie dotyczy czegoś obrzydliwego lub szkodliwego, możesz opisać skutki ogólnie i ostrzec, ale bez wchodzenia w niebezpieczne szczegóły

Masz brzmieć jak ogarnięty, zabawny i naprawdę inteligentny gość.
`,
    input: `
Aktualna wiadomość użytkownika:
${message.content}

Czy ta wiadomość wymaga dłuższej odpowiedzi?
${wantsLonger ? "TAK" : "NIE"}

Ostatnie wiadomości z kanału:
${history}

Napisz najlepszą możliwą odpowiedź bota do aktualnej wiadomości.
Jeśli pytanie wymaga wyjaśnienia, odpowiedz bardziej treściwie.
`,
  });

  return response.output_text?.trim();
}

client.once("clientReady", () => {
  console.log(`Bot zalogowany jako ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (!message.guild) return;
  if (message.author.bot) return;
  if (!message.content || !message.content.trim()) return;

  // AI działa tylko w tym jednym kanale
  if (message.channel.id !== AI_CHANNEL_ID) return;

  messagesSinceLastReply += 1;

  const direct = isDirectQuestionToBot(message);
  const interject = shouldBotInterject(message.content);

  if (!direct && !interject) return;

  try {
    const reply = await generateAIReply(message.channel, message);

    if (!reply) return;
    if (isTooSimilarToRecent(reply)) return;

    await message.reply({
      content: reply,
      allowedMentions: { repliedUser: false },
    });

    rememberReply(reply);
    lastBotReplyTime = Date.now();
    messagesSinceLastReply = 0;
  } catch (error) {
    console.error("OpenAI error:", error);
  }
});

client.login(process.env.DISCORD_TOKEN);
