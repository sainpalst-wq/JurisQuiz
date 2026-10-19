// Función serverless para Vercel. La clave vive SOLO aquí, como variable de entorno.
const RAMAS = {
  constitucional: "Derecho Constitucional (Constitución de 1991, tutela, Corte Constitucional)",
  penal: "Derecho Penal (Código Penal y Proceso Penal)",
  civil: "Derecho Civil (personas, bienes, obligaciones, contratos)",
  laboral: "Derecho Laboral (contratos, prestaciones, seguridad social)",
  familia: "Derecho de Familia (matrimonio, alimentos, filiación)",
  administrativo: "Derecho Administrativo (Estado, contratación, CPACA)",
  comercial: "Derecho Comercial (sociedades, títulos valores)",
  procesal: "Derecho Procesal (Código General del Proceso)",
  tributario: "Derecho Tributario (Estatuto Tributario, DIAN)",
  ddhh: "Derechos Humanos y Derecho Internacional (bloque de constitucionalidad)",
  mix: "una mezcla equilibrada de las distintas ramas del derecho colombiano",
};
const NIVELES = ["Básico", "Intermedio", "Avanzado"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { branch, level, seen } = req.body || {};
  const area = RAMAS[branch];
  const nivel = NIVELES[level];
  if (!area || !nivel) return res.status(400).json({ error: "bad request" });
  const n = 8;
  const vistas = Array.isArray(seen) ? seen.slice(-30).map((x) => String(x).slice(0, 80)) : [];

  const prompt = `Eres un profesor experto en derecho colombiano. Genera ${n} preguntas de opción múltiple sobre ${area}, nivel ${nivel}.
Reglas: basadas en normativa y jurisprudencia colombiana real y consolidada. Cada pregunta trata un subtema distinto. Evita datos dudosos o muy recientes. Una sola respuesta correcta y tres distractores plausibles. Semilla de variación: ${Math.random().toString(36).slice(2, 9)}. No repitas: ${JSON.stringify(vistas)}.
Responde SOLO con un objeto JSON {"questions":[...]} con ${n} elementos de la forma {"q":"enunciado","options":["a","b","c","d"],"answer":indice_0_a_3,"explanation":"máx 2 frases","ref":"fundamento legal"}`;

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + process.env.OPENAI_API_KEY,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // verifica en platform.openai.com el modelo vigente que prefieras
        response_format: { type: "json_object" },
        max_tokens: 3000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!r.ok) return res.status(r.status === 429 ? 429 : 502).json({ error: "upstream" });
    const data = await r.json();
    const text = data.choices[0].message.content;
    return res.status(200).json(JSON.parse(text));
  } catch (e) {
    return res.status(500).json({ error: "server" });
  }
}
