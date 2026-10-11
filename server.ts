import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in server environment");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function parseJsonSafely(rawText: string | undefined): any {
  if (!rawText) return {};
  try {
    return JSON.parse(rawText);
  } catch {
    // Attempt markdown fence removal
    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    return JSON.parse(cleaned);
  }
}

// Resilient execution candidate models
const FALLBACK_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
  "gemini-flash-latest",
];

async function callGeminiWithResilience(
  ai: GoogleGenAI,
  params: {
    contents: string;
    config: any;
  }
) {
  let lastError: any = null;

  for (const model of FALLBACK_MODELS) {
    const maxRetries = 1; // 1 quick retry per model before swift fallback to next candidate
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Gemini API] Requesting ${model} (attempt ${attempt + 1}/${maxRetries + 1})...`);
        const response = await ai.models.generateContent({
          model,
          contents: params.contents,
          config: params.config,
        });

        if (response && response.text) {
          return response;
        }
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || err || "").toLowerCase();
        const isTemporarySpike =
          msg.includes("503") ||
          msg.includes("unavailable") ||
          msg.includes("high demand") ||
          msg.includes("spikes in demand") ||
          msg.includes("429") ||
          msg.includes("resource_exhausted") ||
          msg.includes("overloaded") ||
          msg.includes("timeout") ||
          msg.includes("econnreset") ||
          msg.includes("fetch failed");

        console.warn(`[Gemini API] ${model} attempt ${attempt + 1} encountered: ${err?.message || err}`);

        if (isTemporarySpike) {
          if (attempt < maxRetries) {
            const delayMs = 400 + Math.floor(Math.random() * 300);
            console.log(`[Gemini API] Temporary spike detected. Quick retry in ${delayMs}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            continue;
          } else {
            console.warn(`[Gemini API] Switching immediately to next fallback candidate...`);
            break;
          }
        } else {
          throw err;
        }
      }
    }
  }

  throw lastError;
}

function handleGeminiError(error: any, res: express.Response, defaultArabicMessage: string) {
  console.error("Gemini Route Error:", error);
  const msg = String(error?.message || error || "").toLowerCase();
  const isHighDemand =
    msg.includes("503") ||
    msg.includes("high demand") ||
    msg.includes("unavailable") ||
    msg.includes("spikes in demand") ||
    msg.includes("429") ||
    msg.includes("resource_exhausted");

  const friendlyMessage = isHighDemand
    ? "خوادم الذكاء الاصطناعي تشهد إقبالاً وضغطاً مؤقتاً في هذه اللحظة. يرجى النقر على زر 'إعادة المحاولة' للمتابعة."
    : error?.message || defaultArabicMessage;

  res.status(isHighDemand ? 503 : 500).json({
    success: false,
    error: friendlyMessage,
    isTemporary: isHighDemand,
    canRetry: true,
  });
}

let imageQuotaBlockedUntil = 0;

function createBotanicalSvgDataUrl(
  herbName: string,
  scientific?: string,
  system?: string
): string {
  const safeName = herbName || "عشبة طبية";
  const safeSci = scientific || "Plantae Medicinalis";
  const safeSys = system || "المناعة والصحة العامة";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="100%" height="100%">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#0B1B13"/>
        <stop offset="50%" stopColor="#132B20"/>
        <stop offset="100%" stopColor="#1B382B"/>
      </linearGradient>
      <radialGradient id="goldGlow" cx="50%" cy="45%" r="60%">
        <stop offset="0%" stopColor="#C59B27" stopOpacity="0.3"/>
        <stop offset="60%" stopColor="#C59B27" stopOpacity="0.08"/>
        <stop offset="100%" stopColor="#C59B27" stopOpacity="0"/>
      </radialGradient>
      <linearGradient id="goldBorder" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#F5DC7D"/>
        <stop offset="50%" stopColor="#C59B27"/>
        <stop offset="100%" stopColor="#8C6A18"/>
      </linearGradient>
      <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="0.5"/>
      </filter>
    </defs>
    <rect width="600" height="600" fill="url(#bgGrad)"/>
    <circle cx="300" cy="270" r="230" fill="url(#goldGlow)"/>

    <rect x="25" y="25" width="550" height="550" rx="24" fill="none" stroke="url(#goldBorder)" stroke-width="2.5" opacity="0.85"/>
    <rect x="35" y="35" width="530" height="530" rx="18" fill="none" stroke="url(#goldBorder)" stroke-width="1" stroke-dasharray="4 4" opacity="0.5"/>

    <g fill="none" stroke="url(#goldBorder)" stroke-width="1.5">
      <path d="M 45 65 L 45 45 L 65 45"/>
      <circle cx="45" cy="45" r="3" fill="#C59B27"/>
      <path d="M 555 65 L 555 45 L 535 45"/>
      <circle cx="555" cy="45" r="3" fill="#C59B27"/>
      <path d="M 45 535 L 45 555 L 65 555"/>
      <circle cx="45" cy="555" r="3" fill="#C59B27"/>
      <path d="M 555 535 L 555 555 L 535 555"/>
      <circle cx="555" cy="555" r="3" fill="#C59B27"/>
    </g>

    <g transform="translate(300, 75)" text-anchor="middle">
      <rect x="-110" y="-14" width="220" height="28" rx="14" fill="#0E2117" stroke="url(#goldBorder)" stroke-width="1.2"/>
      <text y="5" fill="#F5DC7D" font-family="'Cairo', sans-serif" font-size="12" font-weight="bold" letter-spacing="1">
        صيدلية 1000 عشبة الطبية
      </text>
    </g>

    <circle cx="300" cy="255" r="140" fill="#0C1F16" stroke="url(#goldBorder)" stroke-width="2" filter="url(#shadow)"/>
    <circle cx="300" cy="255" r="130" fill="none" stroke="url(#goldBorder)" stroke-width="1" stroke-dasharray="3 3" opacity="0.6"/>

    <g transform="translate(300, 255)">
      <path d="M 0 95 Q 5 10 -5 -80" fill="none" stroke="#689F77" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M 0 95 Q 5 10 -5 -80" fill="none" stroke="#C59B27" stroke-width="1" stroke-linecap="round" opacity="0.7"/>

      <path d="M -2 40 C -45 35 -65 10 -50 -10 C -35 5 -15 25 -2 40 Z" fill="#2E6B47" stroke="#90C59E" stroke-width="1.5"/>
      <path d="M 2 20 C 45 15 65 -10 50 -30 C 35 -15 15 5 2 20 Z" fill="#3B7D54" stroke="#90C59E" stroke-width="1.5"/>
      <path d="M -4 -10 C -40 -15 -55 -40 -38 -55 C -28 -38 -12 -22 -4 -10 Z" fill="#2E6B47" stroke="#90C59E" stroke-width="1.5"/>
      <path d="M 0 -30 C 35 -35 50 -60 35 -75 C 25 -58 12 -42 0 -30 Z" fill="#3B7D54" stroke="#90C59E" stroke-width="1.5"/>

      <circle cx="-5" cy="-84" r="14" fill="#C59B27" opacity="0.9"/>
      <circle cx="-5" cy="-84" r="9" fill="#F5DC7D"/>
      <circle cx="-5" cy="-84" r="4" fill="#132B20"/>

      <circle cx="-50" cy="-10" r="5" fill="#E8C35A"/>
      <circle cx="50" cy="-30" r="5" fill="#E8C35A"/>
      <circle cx="-38" cy="-55" r="4" fill="#E8C35A"/>
      <circle cx="35" cy="-75" r="4" fill="#E8C35A"/>
    </g>

    <g transform="translate(300, 410)" text-anchor="middle">
      <rect x="-95" y="-12" width="190" height="24" rx="12" fill="#1B382B" stroke="url(#goldBorder)" stroke-width="1"/>
      <text y="4" fill="#F5DC7D" font-family="'Cairo', sans-serif" font-size="11" font-weight="bold">
        🌿 ${safeSys}
      </text>
    </g>

    <text x="300" y="475" text-anchor="middle" fill="#FFFFFF" font-family="'Cairo', sans-serif" font-size="28" font-weight="900" filter="url(#shadow)">
      ${safeName}
    </text>

    <text x="300" y="508" text-anchor="middle" fill="#C59B27" font-family="serif" font-style="italic" font-size="16" letter-spacing="1">
      ${safeSci}
    </text>

    <text x="300" y="538" text-anchor="middle" fill="#8EA898" font-family="'Amiri', serif" font-size="13">
      «خلاصة نباتية موثقة ومعتمدة سريرياً»
    </text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// AI: Generate realistic botanical image for a herb with graceful SVG fallback
async function generateHerbBotanicalImage(
  ai: GoogleGenAI,
  herbName: string,
  scientific?: string,
  system?: string
): Promise<string> {
  // If free tier quota is temporarily blocked (429 limit: 0), smoothly use authentic botanical SVG art
  if (Date.now() < imageQuotaBlockedUntil) {
    console.log(`[Botanical Art] Using authentic botanical SVG illustration for "${herbName}" (Imagen free tier quota limit: 0)`);
    return createBotanicalSvgDataUrl(herbName, scientific, system);
  }

  const prompt = `A studio-lit professional macro photograph of the medicinal herb "${herbName}" ${
    scientific ? `(${scientific})` : ""
  }. Natural botanical specimen showcasing fresh vibrant leaves, herbal texture, delicate flowers or seeds, placed elegantly on a clean natural wooden surface with soft warm apothecary lighting. High resolution, sharp focus, botanical product photography, ultra-realistic, authentic colors, clean composition.`;

  const imageModels = ["gemini-3.1-flash-lite-image", "gemini-3-pro-image"];

  for (const model of imageModels) {
    try {
      console.log(`[Gemini Image API] Requesting ${model} for "${herbName}"...`);
      const response = await ai.models.generateContent({
        model,
        contents: {
          parts: [{ text: prompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1",
          },
        },
      });

      const parts = response.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          const mimeType = part.inlineData.mimeType || "image/png";
          return `data:${mimeType};base64,${part.inlineData.data}`;
        }
      }
    } catch (err: any) {
      const errStr = String(err?.message || err || "").toLowerCase();
      const isQuota =
        errStr.includes("429") ||
        errStr.includes("quota") ||
        errStr.includes("resource_exhausted") ||
        errStr.includes("limit: 0");

      if (isQuota) {
        console.warn(`[Gemini Image API] Free tier image quota exceeded on ${model}. Enabling botanical SVG fallback for 10 minutes.`);
        imageQuotaBlockedUntil = Date.now() + 10 * 60 * 1000;
        break; // Skip further image API calls that will fail with 429
      } else {
        console.warn(`[Gemini Image API] Model ${model} failed for "${herbName}":`, err?.message || err);
      }
    }
  }

  // Graceful botanical artwork fallback
  return createBotanicalSvgDataUrl(herbName, scientific, system);
}

// API Routes
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// AI: Generate comprehensive clinical & botanical monograph for any herb or plant
app.post("/api/gemini/add-herb", async (req, res) => {
  try {
    const { plantQuery } = req.body;
    if (!plantQuery || typeof plantQuery !== "string") {
      res.status(400).json({ error: "اسم النبتة أو الوصف مطلوب" });
      return;
    }

    const ai = getGenAI();
    const systemInstruction = `أنت خبير صيدلاني سريري وباحث ومحقق في علم العقاقير والنباتات الطبية والتراث الطبي العربي والإسلامي (Pharmacognosy, Phytotherapy & Classical Arabic Herbal Heritage) لدى موسوعة وصيدلية '1000 عشبة' (جُمعت لأجلك).
مهمتك: توليد بطاقة علمية وتراثية شاملة ودقيقة لأي عشبة أو نبتة طبية يطلبها المستخدم، مستنداً ومستشهداً بالمصادر المعتمدة الأصيلة:

أولاً: أمهات كتب التراث الطبي العربي والإسلامي:
1. كتاب «الطب النبوي» للإمام ابن قيم الجوزية، وكتاب «الطب النبوي» للإمام الذهبي (الأحاديث النبوية، ومنافع النباتات المذكورة في السنة النبوية، وتطبيقاتها العلاجية).
2. موسوعة «القانون في الطب» للشيخ الرئيس ابن سينا (ماهية العشبة، مزاجها: حار/بارد/رطب/يابس، درجتها، وأفعالها وخواصها في علاج الأعضاء والرأس والصدر والأحشاء).
3. كتاب «الجامع لمفردات الأدوية والأغذية» للمحدث العشاب ضياء الدين ابن البيطار.
4. كتاب «تذكرة أولي الألباب والجامع للعجب العجاب» للحكيم داود الأنطاكي.
5. كتاب «الحاوي في الطب» للحكيم أبي بكر الرازي.

ثانياً: دساتير الأدوية والبحوث السريرية العالمية الحديثة:
1. دراسات منظمة الصحة العالمية للنباتات الطبية (WHO Monographs on Selected Medicinal Plants Volumes 1-4)
2. دراسات الهيئة الأوروبية للأدوية (EMA/HMPC Community Herbal Monographs)
3. دستور اللجنة الألمانية للأعشاب الطبية (German Commission E Monographs)
4. دستور الأدوية الأمريكي للمكملات النباتية (United States Pharmacopeia - USP-NF)
5. التعاونية العلمية الأوروبية للعلاج بالنباتات (ESCOP Monographs)
6. بردية إيبرس المصرية الطبية وبرديات الطب المصري القديم (Ebers Papyrus c. 1550 BCE)
7. المكتبة الوطنية الأمريكية للطب وأبحاث (PubMed / NCBI & NIH-NCCIH).

الإخراج يجب أن يكون بتنسيق JSON متوافق مع المخطط المحدد بالكامل، مع معلومات سريرية دقيقة، جرعات قياسية، اقتباس صريح وموثق من كتب التراث العربي وابن سينا والطب النبوي، وسرد كامل للمراجع المعتمدة.`;

    const prompt = `قم بإنشاء بطاقة سريرية وتوثيقية كاملة للعشبة أو النبتة الطبية: "${plantQuery}".
تأكد من استخراج وتوثيق الآتي مستشهداً بالمصادر العربية الأصيلة والمراجع العالمية:
1. الاسم العربي الشائع والدقيق (nameAr).
2. الاسم الإنجليزي (nameEn).
3. الاسم العلمي باللاتينية (scientific).
4. الفصيلة النباتية (family).
5. الجهاز الحيوي المستهدف (system): اختر الفئة الأنسب من بين:
   - "المناعة"
   - "الهضم والكبد"
   - "الأعصاب والتكيف"
   - "التنفس والقلب"
   - "الهرمونات والصحة العامة"
   - "المفاصل والكلى"
   - "مغذية ووقائية"
   - "الجلد والتجميل"
6. التأثير والهدف العلاجي الرئيسي (target).
7. المادة الفعالة الرئيسية (active).
8. الجرعة القياسية وطريقة الاستعمال (dose).
9. طريقة التحضير الصيدلانية التقليدية (منقوع، مغلي، مسحوق، كبسولة، صبغة) (preparation).
10. درجة الأمان والمحاذير السريرية (safety).
11. موانع الاستعمال الصارمة (contraindications).
12. أهم التداخلات الدوائية المعروفة (interactions).
13. اقتباس وتوثيق صريح من كتب التراث الطبي العربي والطب النبوي (arabicHeritageCitation):
    - استشهد بدقة بما ورد عن هذه النبتة في "كتاب الطب النبوي" لابن القيم أو الذهبي إن ذُكرت أو ثبت فيها حديث/أثر.
    - واستشهد بما نص عليه الشيخ الرئيس ابن سينا في "القانون في الطب" مبيناً مزاجها (حرارتها وبرودتها ويبوستها) ونفعها للأعضاء.
    - أو ما ذكره ابن البيطار في "الجامع لمفردات الأدوية والأغذية" أو داود الأنطاكي في "التذكرة".
    - اذكر نص المقولة مع عزوها الصريح لمؤلفها وكتابه.
14. لمحة تاريخية أو أثرية موثقة في التراث المصري القديم وبردية إيبرس أو الحضارات العريقة (historicalNote).
15. وسم درجة الخطورة أو الحذر (safetyLevel): "آمن جداً" أو "حذر معتدل" أو "عالي الخطورة ويشترط إشراف طبي".
16. شرح وتوصيف صيدلاني مفصل للمنتج (description): شرح علمي متعمق يجمع بين الأصالة الطبية العربية والاكتشافات الصيدلانية الحديثة.
17. آلية العمل الدوائية والفسيولوجية في الجسم (pharmacology): تفاعل المواد الفعالة داخل الجسم.
18. قائمة بأهم 4 فوائد علاجية وصحية ملموسة للمنتج (benefits).
19. المراجع العلمية الدولية والتراثية المعتمدة (references): وثّق فيها كتب التراث (مثل: كتاب الطب النبوي لابن القيم، القانون في الطب لابن سينا، الجامع لابن البيطار) بجانب المراجع الدولية (WHO Monographs, German Commission E, EMA, USP).`;

    const response = await callGeminiWithResilience(ai, {
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            nameAr: { type: Type.STRING },
            nameEn: { type: Type.STRING },
            scientific: { type: Type.STRING },
            family: { type: Type.STRING },
            system: { type: Type.STRING },
            target: { type: Type.STRING },
            active: { type: Type.STRING },
            dose: { type: Type.STRING },
            preparation: { type: Type.STRING },
            safety: { type: Type.STRING },
            contraindications: { type: Type.STRING },
            interactions: { type: Type.STRING },
            arabicHeritageCitation: {
              type: Type.STRING,
              description: "اقتباس وتوثيق صريح من كتاب الطب النبوي وكتب ابن سينا (القانون في الطب) وابن البيطار والأنطاكي",
            },
            historicalNote: { type: Type.STRING },
            safetyLevel: { type: Type.STRING },
            description: { type: Type.STRING, description: "شرح صيدلاني وسريري شامل ومفصل جداً للمنتج وفوائده" },
            pharmacology: { type: Type.STRING, description: "آلية العمل الدوائية والتأثير الحيوي في الجسم" },
            benefits: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "أبرز الفوائد والخصائص العلاجية للمنتج",
            },
            references: { type: Type.STRING, description: "المراجع العربية التراثية والدولية المعتمدة المستند إليها" },
          },
          required: [
            "nameAr",
            "nameEn",
            "scientific",
            "system",
            "target",
            "active",
            "dose",
            "safety",
            "description",
          ],
        },
      },
    });

    const parsedData = parseJsonSafely(response.text);

    let imageUrl: string | undefined = undefined;
    if (req.body.includeImage) {
      try {
        const generatedImg = await generateHerbBotanicalImage(
          ai,
          parsedData.nameAr || plantQuery,
          parsedData.scientific
        );
        if (generatedImg) {
          imageUrl = generatedImg;
        }
      } catch (imgErr) {
        console.warn("Optional image generation failed during add:", imgErr);
      }
    }

    res.json({ success: true, herb: { ...parsedData, imageUrl } });
  } catch (error: any) {
    handleGeminiError(error, res, "حدث خطأ أثناء استخراج بيانات النبتة بالذكاء الاصطناعي");
  }
});

// AI: Review herb item and generate authentic personalized identity card & fair store price
app.post("/api/gemini/review-enrich-herb", async (req, res) => {
  try {
    const { herbName, existingData } = req.body;
    if (!herbName || typeof herbName !== "string") {
      res.status(400).json({ error: "اسم العشبة أو الصنف مطلوب للمراجعة" });
      return;
    }

    const ai = getGenAI();
    const systemInstruction = `أنت كبير الصيادلة السريريين ورئيس هيئة التوثيق الدستوري للأعشاب والتراث الطبي العربي والإسلامي (Clinical Pharmacognosy & Islamic Herbal Medicine) لدى صيدلية وموسوعة '1000 عشبة الطبية'.
مهمتك: التدقيق والمراجعة الصيدلانية الشاملة للعشبة أو الصنف المطلوب، وتوليد بطاقة تعريفية سريرية وعلمية وتراثية فريدة وخاصة 100% بهذا الصنف، مع تحديد سعر تجاري عادل بناءً على ندرة وقيمة العشبة الحقيقية.

قواعد الصرامة والدقة لمنع أي تشابه أو تكرار:
1. ممنوع منعاً باتاً استخدام أي عبارات عامة مكررة مثل "مركبات فلافونويدية وزيوت طيارة فعالة" أو نصوص إنشائية مجهولة.
2. استخرج أسماء المواد الكيميائية الفعالة الحقيقية الدقيقة للنبتة بالاسم العلمي الصيدلاني (Active Phytochemicals)، مثل:
   - الكركم: الكركومين (Curcumin) والزيوت التورميرونية
   - الزعتر: الثيمول (Thymol) والكارفاكرول
   - حبة البركة: الثيموكينون (Thymoquinone) والنيجيلين
   - الحلبة: التريغونيلين (Trigonelline) والديوسجينين
   - المورينجا: الإيزوثيوسيانات (Moringin) والكويرسيتين
   - الميرمية: حمض الروزمارينيك والثوجون
   - وهكذا لكل نبتة مادتها الخاصة الحقيقية.
3. استخرج الاسم العلمي اللاتيني الحقيقي الدقيق بدقة نباتية (Binomial nomenclature)، والعائلة النباتية، والاسم بالإنجليزية.
4. حدد التصنيف الطبي الأكثر ملاءمة لجهاز الجسم من بين: ("الهضم والكبد"، "المناعة"، "التنفس والقلب"، "الأعصاب والتكيف"، "الهرمونات والصحة العامة"، "المفاصل والكلى"، "مغذية ووقائية"، "الجلد والتجميل").
5. الجرعة المعيارية الصيدلانية الدقيقة (بالغرام أو الملعقة) وطريقة الاستعمال الآمنة.
6. موانع الاستعمال السريرية الصارمة وأهم التداخلات الدوائية المعروفة.
7. اقتباس تراثي أصيل موثق بدقة من كتب التراث: ما نص عليه الشيخ الرئيس ابن سينا في "القانون في الطب" مع ذكر مزاجها الطبي (حار أو بارد، رطب أو يابس ودرجتها) ونفعها للأعضاء، أو ما ثبت في "الطب النبوي" لابن القيم أو الذهبي، أو "الجامع" لابن البيطار.
8. وصف صيدلاني وسريري مخصص وفريد (description) يشرح مواصفات هذا المنتج وطعمه وفوائده الحقيقية في المتجر.
9. آلية التأثير الحيوي في الجسم (pharmacology) بالمسارات الفسيولوجية والإنزيمية الدقيقة.
10. قائمة بـ 4 فوائد علاجية وصحية ملموسة محددة غير عامة (benefits).
11. سعر مقترح عادل بالريال السعودي (suggestedPrice) لعبوة 100 جم عشب عضوي نقي، يعكس السعر الفعلي في السوق السعودي بناءً على ندرة وصعوبة استيراد العشبة.`;

    const prompt = `قم بمراجعة وتوليد البطاقة التعريفية الحصرية والدقيقة والسعر العادل للعشبة التالية:
اسم الصنف/العشبة: "${herbName}"
بيانات أولية إن وجدت: "${existingData ? JSON.stringify(existingData) : "لا توجد"}"

قم بتوليد بطاقة علمية وصيدلانية وتراثية دقيقة وخالية من التكرار والعموميات بصيغة JSON.`;

    const response = await callGeminiWithResilience(ai, {
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            nameAr: { type: Type.STRING },
            nameEn: { type: Type.STRING },
            scientific: { type: Type.STRING },
            family: { type: Type.STRING },
            system: { type: Type.STRING },
            target: { type: Type.STRING },
            active: { type: Type.STRING },
            dose: { type: Type.STRING },
            preparation: { type: Type.STRING },
            safety: { type: Type.STRING },
            safetyLevel: {
              type: Type.STRING,
              description: "آمن جداً أو حذر معتدل أو عالي الخطورة ويشترط إشراف طبي",
            },
            contraindications: { type: Type.STRING },
            interactions: { type: Type.STRING },
            historicalNote: { type: Type.STRING },
            arabicHeritageCitation: {
              type: Type.STRING,
              description: "اقتباس صريح وموثق من القانون لابن سينا أو الطب النبوي لابن القيم أو الجامع لابن البيطار",
            },
            references: { type: Type.STRING },
            description: { type: Type.STRING, description: "وصف صيدلاني وسريري مخصص لبطاقة المنتج في المتجر" },
            pharmacology: { type: Type.STRING, description: "آلية العمل الحيوية في الجسم" },
            benefits: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "أهم 4 فوائد علاجية لهذا الصنف",
            },
            suggestedPrice: {
              type: Type.NUMBER,
              description: "سعر البيع بالريال السعودي لعبوة 100 جم بناءً على ندرة وقيمة الصنف",
            },
          },
          required: [
            "nameAr",
            "nameEn",
            "scientific",
            "system",
            "target",
            "active",
            "dose",
            "safety",
            "description",
            "benefits",
            "suggestedPrice",
          ],
        },
      },
    });

    const parsedMonograph = parseJsonSafely(response.text);

    // Calculate packages based on suggestedPrice
    const basePrice = Math.max(15, Math.round(parsedMonograph.suggestedPrice || 45));
    const packageOptions = [
      { label: "عبوة 100 جم (عشب عضوي نقي)", price: basePrice },
      { label: "عبوة 250 جم (توفيرية ممتازة)", price: Math.round(basePrice * 2.2) },
      { label: "عبوة 500 جم (نصف كيلو فاخر)", price: Math.round(basePrice * 4.1) },
      { label: "خلاصة مركزة (قطارة صيدلانية 50 مل)", price: Math.round(basePrice * 1.5) },
    ];

    let imageUrl: string | undefined = undefined;
    if (req.body.includeImage) {
      try {
        const generatedImg = await generateHerbBotanicalImage(
          ai,
          herbName,
          parsedMonograph.scientific
        );
        if (generatedImg) {
          imageUrl = generatedImg;
        }
      } catch (imgErr) {
        console.warn("Optional image generation failed during review:", imgErr);
      }
    }

    res.json({
      success: true,
      card: {
        ...parsedMonograph,
        price: basePrice,
        packageOptions,
        imageUrl,
        aiReviewed: true,
        aiReviewedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    handleGeminiError(error, res, "حدث خطأ أثناء مراجعة وتوليد بطاقة التعريف بالذكاء الاصطناعي");
  }
});

// AI: Generate realistic photorealistic botanical image for a herb (with authentic botanical SVG artwork fallback)
app.post("/api/gemini/generate-herb-image", async (req, res) => {
  try {
    const { herbName, scientific, system } = req.body || {};
    if (!herbName || typeof herbName !== "string") {
      res.status(400).json({ success: false, error: "اسم العشبة مطلوب لتوليد الصورة" });
      return;
    }

    try {
      const ai = getGenAI();
      console.log(`[Image Generation] Generating botanical visual for: "${herbName}"...`);
      const imageUrl = await generateHerbBotanicalImage(ai, herbName, scientific, system);

      res.json({
        success: true,
        imageUrl: imageUrl || createBotanicalSvgDataUrl(herbName, scientific, system),
      });
    } catch (genErr) {
      console.warn(`[Image Generation] Generating botanical artwork fallback for: "${herbName}"`);
      const fallbackUrl = createBotanicalSvgDataUrl(herbName, scientific, system);
      res.json({
        success: true,
        imageUrl: fallbackUrl,
      });
    }
  } catch (error: any) {
    const fallbackUrl = createBotanicalSvgDataUrl(req.body?.herbName || "عشبة طبية", req.body?.scientific, req.body?.system);
    res.json({
      success: true,
      imageUrl: fallbackUrl,
    });
  }
});

// AI: Check Drug-Herb Interaction
app.post("/api/gemini/check-interaction", async (req, res) => {
  try {
    const { herbName, medications, condition } = req.body;
    if (!herbName || !medications) {
      res.status(400).json({ error: "اسم العشبة وقائمة الأدوية مطلوبة للفحص" });
      return;
    }

    const ai = getGenAI();
    const prompt = `بصفتك صيدلياً سريرياً خبيراً وباحثاً في التراث الطبي العربي، قم بفحص التداخل الدوائي بين العشبة: "${herbName}"
والأدوية أو المواد التالية: "${medications}"
الحالة الصحية للمريض (إن وجدت): "${condition || "غير محدد"}"

استحضر معلوماتك من أهم المراجع الصيدلانية السريرية المعتمدة عالمياً والتراث الطبي:
- مرجع ستوكلي للتداخلات الدوائية والعشبية (Stockley's Herbal Medicines Interactions)
- تقارير الهيئة الأوروبية للأدوية ولجنة المنتجات العشبية (EMA / HMPC)
- أبحاث المكتبة الوطنية الأمريكية للطب (PubMed / NCBI & NIH-NCCIH)
- ما نص عليه الشيخ الرئيس ابن سينا في "القانون في الطب" والإمام ابن القيم في "الطب النبوي" من تنبيهات لمزج الأعشاب وإصلاح غائلتها.

قم بتقديم تقرير فحص تفصيلي يتضمن:
1. مستوى الخطورة الإجمالي (riskLevel: "آمن - منخفض الخطورة" | "تداخل معتدل - يلزم المراقبة أو المباعدة" | "خطر شديد - تعارض ممنوع تماماً").
2. الآلية الحيوية للتداخل (cytochrome P450, امتصاص، سيولة الدم، ضغط، سكر).
3. التوصية السريرية للمريض وطريقة الاستخدام الآمنة أو البديل.
4. مدة الفصل الزمني الموصى بها بين الجرعات.
5. توجيه أو ملاحظة من كتب التراث الطبي العربي أو ابن سينا أو الطب النبوي حول هذه النبتة وطبائعها (traditionalNote).
6. المراجع السريرية والتراثية المعتمدة (references).`;

    const response = await callGeminiWithResilience(ai, {
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            riskLevel: { type: Type.STRING },
            riskColor: { type: Type.STRING, description: "green, yellow, red" },
            mechanism: { type: Type.STRING },
            clinicalAdvice: { type: Type.STRING },
            spacingHours: { type: Type.STRING },
            summary: { type: Type.STRING },
            traditionalNote: { type: Type.STRING, description: "توجيهات ابن سينا والطب النبوي بخصوص هذه النبتة ومزاجها" },
            references: { type: Type.STRING, description: "المراجع السريرية والتراثية المعتمدة (Stockley's, EMA, القانون لابن سينا، الطب النبوي)" },
          },
          required: ["riskLevel", "mechanism", "clinicalAdvice", "summary"],
        },
      },
    });

    const analysis = parseJsonSafely(response.text);
    res.json({ success: true, analysis });
  } catch (error: any) {
    handleGeminiError(error, res, "حدث خطأ أثناء فحص التداخل الدوائي");
  }
});

// AI: Smart Phytotherapy Remedy Advisor
app.post("/api/gemini/remedy-advisor", async (req, res) => {
  try {
    const { symptoms, userProfile } = req.body;
    if (!symptoms) {
      res.status(400).json({ error: "الأعراض أو الهدف الصحي مطلوب" });
      return;
    }

    const ai = getGenAI();
    const prompt = `استناداً إلى موسوعة "1000 عشبة" ودساتير الأعشاب الطبية العالمية الحديثة، وأمهات كتب التراث الطبي العربي والإسلامي:
1. كتاب «الطب النبوي» للإمام ابن قيم الجوزية وكتاب «الطب النبوي» للإمام الذهبي
2. كتاب «القانون في الطب» للشيخ الرئيس ابن سينا
3. كتاب «الجامع لمفردات الأدوية والأغذية» لابن البيطار
4. دساتير (WHO Monographs, German Commission E, ESCOP, EMA/HMPC, وبردية إيبرس):

ما هي أفضل الوصفات والأعشاب الطبيعية الموصى بها للحالة التالية:
الأعراض أو الهدف: "${symptoms}"
معلومات إضافية (عمر، أمراض مزمنة، حمل/إرضاع): "${userProfile || "لا يوجد"}"

قدم بروتوكولاً عشبياً مقترحاً موثقاً يجمع بين العلم الحديث وهدي التراث الطبي العربي:
1. أسماء 2 إلى 3 أعشاب رئيسية مناسبة مع ذكر أسمائها العلمية ودورها العلاجي.
2. طريقة التحضير الصيدلانية الدقيقة والجرعة اليومية الآمنة.
3. التحذيرات وموانع الاستعمال الدقيقة.
4. نصائح نمط الحياة والتغذية المصاحبة.
5. استشهاد وهدي من "كتاب الطب النبوي" أو توجيه من "كتاب القانون في الطب لابن سينا" للحالة (arabicHeritageAdvice): اذكر نصيحة أو مقولة الشيخ الرئيس ابن سينا أو ما ورد في الطب النبوي للحالة.
6. المراجع العلمية الدولية والتراثية المعتمدة المستند إليها (references).`;

    const response = await callGeminiWithResilience(ai, {
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            recommendedHerbs: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  herbName: { type: Type.STRING },
                  role: { type: Type.STRING },
                  doseAndUsage: { type: Type.STRING },
                },
                required: ["herbName", "role", "doseAndUsage"],
              },
            },
            preparationGuide: { type: Type.STRING },
            precautions: { type: Type.STRING },
            lifestyleTip: { type: Type.STRING },
            arabicHeritageAdvice: {
              type: Type.STRING,
              description: "توجيهات واستشهادات من كتاب الطب النبوي وكتاب القانون في الطب لابن سينا للمريض",
            },
            references: { type: Type.STRING, description: "المراجع الدولية ودساتير التراث العربي المعتمدة" },
          },
          required: ["title", "recommendedHerbs", "preparationGuide", "precautions"],
        },
      },
    });

    const advisorResult = parseJsonSafely(response.text);
    res.json({ success: true, protocol: advisorResult });
  } catch (error: any) {
    handleGeminiError(error, res, "حدث خطأ أثناء إعداد البروتوكول النباتي");
  }
});

// Cloud SQL (PostgreSQL) Status & Sync Endpoints
app.get("/api/cloudsql/status", async (_req, res) => {
  try {
    if (!process.env.SQL_HOST) {
      res.json({
        enabled: true,
        connected: false,
        instance: "ai-studio-4dac90ab",
        region: "europe-west2",
        database: "postgres",
        message: "Cloud SQL instance provisioned",
      });
      return;
    }
    const { db } = await import("./src/db/index.ts");
    const { users } = await import("./src/db/schema.ts");
    await db.select().from(users).limit(1);
    res.json({
      enabled: true,
      connected: true,
      instance: "ai-studio-4dac90ab",
      region: "europe-west2",
      database: "postgres",
    });
  } catch (err: any) {
    res.json({
      enabled: true,
      connected: false,
      instance: "ai-studio-4dac90ab",
      region: "europe-west2",
      error: err.message,
    });
  }
});

app.post("/api/cloudsql/sync", async (req, res) => {
  try {
    const { user, herbs: items } = req.body;
    if (!user || !user.uid) {
      res.status(400).json({ error: "User UID is required" });
      return;
    }
    const { getOrCreateUser, saveHerbToSql } = await import("./src/db/users.ts");
    await getOrCreateUser(user.uid, user.email, user.displayName);
    if (Array.isArray(items)) {
      for (const item of items) {
        if (item.isCustom) {
          await saveHerbToSql({
            customId: String(item.id),
            userUid: user.uid,
            nameAr: item.nameAr,
            nameEn: item.nameEn,
            scientific: item.scientific,
            family: item.family,
            system: item.system,
            target: item.target,
            active: item.active,
            dose: item.dose,
            preparation: item.preparation,
            safety: item.safety,
            safetyLevel: item.safetyLevel,
            contraindications: item.contraindications,
            interactions: item.interactions,
            historicalNote: item.historicalNote,
            references: item.references,
          });
        }
      }
    }
    res.json({ success: true, count: items?.length || 0 });
  } catch (err: any) {
    console.error("Cloud SQL Sync Error:", err);
    res.status(500).json({ error: err.message || "فشل المزامنة مع Cloud SQL" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[1000 Herbs Server] running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
