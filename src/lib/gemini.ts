// /api/gemini.js
export default async function handler(req, res) {
  try {
    const { audioBase64, mimeType, existingAttendees } = req.body;

    const apiKey = process.env.GEMINI_API_KEY;

    const model = "gemini-3-flash-preview";

    const attendeeContext = Object.entries(existingAttendees || {})
      .map(([id, name]) => `${id}: ${name}`)
      .join(", ");

    const prompt = `... (기존 그대로 복붙)`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    data: audioBase64,
                    mimeType: mimeType,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
          },
        }),
      }
    );

    const data = await response.json();
    res.status(200).json(data);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
