import crypto from "node:crypto";
export const config = { maxDuration: 60 };

const MAX_POR_ENLACE = 2; // personas por enlace de invitación
const LIMITE_DIARIO = 20; // partidas por día
const NP = Number(process.env.NUM_PREGUNTAS) || 8; // preguntas por partida
const RURL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const RTOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const SECRET = process.env.AUTH_SECRET;
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

async function rd(...cmd) {
  const r = await fetch(RURL, { method: "POST", headers: { Authorization: "Bearer " + RTOK }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
const hoy = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10); // hora de Colombia
const hashPw = (p, salt) => crypto.scryptSync(p, salt, 32).toString("hex");
const sign = (p) => crypto.createHmac("sha256", SECRET).update(p).digest("base64url");
const firmar = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Date.now() + 6 * 3600e3 })).toString("base64url"); return p + "." + sign(p); };
function verificar(t) {
  try {
    const [p, s] = (t || "").split(".");
    const a = Buffer.from(s), b = Buffer.from(sign(p));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const d = JSON.parse(Buffer.from(p, "base64url").toString());
    return d.e > Date.now() ? d.u : null;
  } catch { return null; }
}
const igual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const restantes = async (u) => Math.max(0, LIMITE_DIARIO - Number((await rd("GET", `q:${u}:${hoy()}`)) || 0));

const SCH_P = { type: "object", properties: { questions: { type: "array", items: { type: "object", properties: { q: { type: "string" }, options: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 }, answer: { type: "integer" }, explanation: { type: "string" }, ref: { type: "string" } }, required: ["q", "options", "answer", "explanation", "ref"] } } }, required: ["questions"] };
const SCH_V = { type: "object", properties: { resultados: { type: "array", items: { type: "object", properties: { i: { type: "integer" }, respuesta: { type: "integer" }, segura: { type: "boolean" } }, required: ["i", "respuesta", "segura"] } } }, required: ["resultados"] };
async function claude(prompt, tool, schema) {
  for (let i = 0; i < 2; i++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: 4000, thinking: { type: "disabled" }, tools: [{ name: tool, description: "Entrega el resultado", input_schema: schema }], tool_choice: { type: "auto" }, messages: [{ role: "user", content: prompt }] }),
    });
    if (!r.ok) throw new Error("Anthropic respondió " + r.status + ": " + (await r.text()).slice(0, 200));
    const blk = (await r.json()).content.find((c) => c.type === "tool_use");
    if (blk && blk.input) return blk.input;
  }
  throw new Error("La respuesta llegó sin datos");
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const fail = (c, detail) => res.status(c).json({ detail });
  if (req.method === "GET") {
    const q = req.query || {};
    if (q.accion === "invitar" || q.accion === "reportes") {
      if (!process.env.ADMIN_KEY || !igual(q.clave || "", process.env.ADMIN_KEY)) return fail(403, "Clave de administrador incorrecta");
      if (q.accion === "reportes") return res.status(200).json({ reportes: (await rd("LRANGE", "reportes", 0, 49)).map((x) => JSON.parse(x)) });
      const code = crypto.randomBytes(6).toString("hex");
      await rd("SET", "inv:" + code, "1");
      return res.status(200).json({ enlace: `https://${req.headers.host}/?inv=${code}`, personas_maximo: MAX_POR_ENLACE });
    }
    return res.status(200).json({ ok: true, version: "v8-verificado", modelo: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", anthropic: !!process.env.ANTHROPIC_API_KEY, base_de_datos: !!(RURL && RTOK), auth_secret: !!SECRET, admin_key: !!process.env.ADMIN_KEY });
  }
  if (req.method !== "POST") return res.status(405).end();
  if (!RURL || !RTOK || !SECRET) return fail(500, "Falta configurar la base de datos o AUTH_SECRET en Vercel");
  const b = req.body || {};
  const user = String(b.usuario || "").toLowerCase().trim();
  try {
    if (b.accion === "registro") {
      const clave = String(b.clave || "");
      if (!/^[a-z0-9_.]{3,24}$/.test(user)) return fail(400, "Usuario: 3 a 24 caracteres (letras, números, punto o guion bajo)");
      if (clave.length < 8 || clave.length > 72) return fail(400, "La contraseña debe tener entre 8 y 72 caracteres");
      const inv = String(b.invitacion || "").trim().toLowerCase();
      if (!/^[a-f0-9]{12}$/.test(inv) || (await rd("GET", "inv:" + inv)) !== "1") return fail(403, "Enlace de invitación no válido");
      const n = await rd("INCR", `inv:${inv}:usos`);
      if (n > MAX_POR_ENLACE) { await rd("DECR", `inv:${inv}:usos`); return fail(403, "Este enlace ya fue usado por " + MAX_POR_ENLACE + " personas"); }
      const salt = crypto.randomBytes(16).toString("hex");
      const ok = await rd("SET", "user:" + user, JSON.stringify({ salt, h: hashPw(clave, salt), inv }), "NX");
      if (!ok) { await rd("DECR", `inv:${inv}:usos`); return fail(409, "Ese usuario ya existe"); }
      return res.status(200).json({ token: firmar(user), usuario: user, restantes: LIMITE_DIARIO });
    }
    if (b.accion === "entrar") {
      const fk = "fail:" + user;
      if (Number((await rd("GET", fk)) || 0) >= 8) return fail(429, "Demasiados intentos. Espera 15 minutos.");
      const raw = await rd("GET", "user:" + user);
      const u = raw ? JSON.parse(raw) : null;
      if (!u || !igual(hashPw(String(b.clave || ""), u.salt), u.h)) {
        if ((await rd("INCR", fk)) === 1) await rd("EXPIRE", fk, 900);
        return fail(401, "Usuario o contraseña incorrectos");
      }
      return res.status(200).json({ token: firmar(user), usuario: user, restantes: await restantes(user) });
    }
    const me = verificar((req.headers.authorization || "").replace("Bearer ", ""));
    if (!me) return fail(401, "Tu sesión terminó. Entra de nuevo.");
    if (b.accion === "estado") return res.status(200).json({ usuario: me, restantes: await restantes(me) });
    if (b.accion === "preguntas") {
      const area = RAMAS[b.branch], nivel = NIVELES[b.level];
      if (!area || !nivel) return fail(400, "Solicitud no válida");
      if (!process.env.ANTHROPIC_API_KEY) return fail(500, "Falta ANTHROPIC_API_KEY en Vercel");
      const k = `q:${me}:${hoy()}`;
      const n = await rd("INCR", k);
      if (n === 1) await rd("EXPIRE", k, 172800);
      if (n > LIMITE_DIARIO) { await rd("DECR", k); return fail(429, `Alcanzaste el límite de ${LIMITE_DIARIO} partidas de hoy. Se reinicia a las 12:00 a. m. (hora de Colombia).`); }
      const vistas = Array.isArray(b.seen) ? b.seen.slice(-30).map((x) => String(x).slice(0, 80)) : [];
      const prompt = `Eres un profesor experto en derecho colombiano. Genera ${NP + 2} preguntas de opción múltiple sobre ${area}, nivel ${nivel}.
Reglas estrictas: usa solo contenido estable y verificable (texto de la Constitución de 1991, códigos y leyes principales, con su artículo). Evita cifras, plazos, montos y fechas salvo que estés completamente seguro, y evita jurisprudencia o reformas recientes. Cada pregunta debe tener una única respuesta correcta indiscutible, sin ambigüedad y sin opciones tipo "todas las anteriores". El campo ref debe citar el artículo y la norma concretos. Si dudas de una pregunta, cámbiala por otra. Cada pregunta trata un subtema distinto. Semilla de variación: ${Math.random().toString(36).slice(2, 9)}. No repitas: ${JSON.stringify(vistas)}.
Entrega las preguntas con la herramienta. "answer" es el índice (0 a 3) de la opción correcta; "explanation" máx. 1 frase corta.`;
      try {
        const gen = (await claude(prompt, "entregar_preguntas", SCH_P)).questions || [];
        const lista = gen.filter((x) => x && x.q && Array.isArray(x.options) && x.options.length === 4 && Number.isInteger(x.answer) && x.answer >= 0 && x.answer <= 3);
        const vp = `Eres un jurista colombiano revisando un examen. Para cada pregunta, responde de forma independiente según la normativa colombiana vigente: indica el índice (0 a 3) de la opción correcta. Marca segura=false si hay ambigüedad, más de una opción defendible, información posiblemente desactualizada o cualquier duda.
${JSON.stringify(lista.map((x, i) => ({ i, pregunta: x.q, opciones: x.options })))}
Entrega el resultado con la herramienta.`;
        const ver = (await claude(vp, "entregar_veredicto", SCH_V)).resultados || [];
        const ok = lista.filter((x, i) => { const v = ver.find((y) => y.i === i); return v && v.segura && v.respuesta === x.answer; }).slice(0, NP);
        if (ok.length < 3) throw new Error("La revisión descartó demasiadas preguntas; intenta de nuevo");
        return res.status(200).json({ questions: ok, restantes: Math.max(0, LIMITE_DIARIO - n) });
      } catch (e) {
        await rd("DECR", k); // si falla, no cuenta la partida
        return fail(502, "No se pudieron generar las preguntas. " + String(e.message).slice(0, 200));
      }
    }
    if (b.accion === "reportar") {
      await rd("LPUSH", "reportes", JSON.stringify({ u: me, fecha: hoy(), q: String(b.q || "").slice(0, 400), o: Array.isArray(b.o) ? b.o.slice(0, 4).map((x) => String(x).slice(0, 150)) : [], marcada: b.a, ref: String(b.ref || "").slice(0, 150) }));
      await rd("LTRIM", "reportes", 0, 499);
      return res.status(200).json({ ok: true });
    }
    return fail(400, "Acción desconocida");
  } catch (e) {
    return fail(500, "Error del servidor: " + String(e.message).slice(0, 200));
  }
}
