# Publicar JurisQuiz en Vercel (gratis para empezar)

1. Crea una cuenta en https://console.anthropic.com, agrega saldo y crea una API key.
2. Crea una cuenta en https://vercel.com.
3. Sube esta carpeta (index.html + api/preguntas.js) a un repositorio de GitHub e impórtalo en Vercel.
   (Alternativa: instala Vercel CLI y ejecuta `vercel` dentro de la carpeta.)
4. En Vercel: Settings > Environment Variables > agrega ANTHROPIC_API_KEY con tu clave.
5. Redeploy. Tu juego queda en https://tu-proyecto.vercel.app. Puedes conectar tu dominio en Settings > Domains.

Importante: nunca pongas la clave dentro de index.html.
Recomendado: en console.anthropic.com define un límite de gasto mensual para evitar abusos.

## Alternativa: usar OpenAI (ChatGPT) en vez de Anthropic
1. Crea una API key en https://platform.openai.com (la suscripción de ChatGPT Plus NO incluye API; se paga aparte).
2. Borra api/preguntas.js y renombra preguntas-openai.js a api/preguntas.js.
3. En Vercel agrega la variable OPENAI_API_KEY (en lugar de ANTHROPIC_API_KEY).
