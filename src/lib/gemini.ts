export interface MeetingAnalysis {
  transcription: { speaker: string; text: string }[];
  minutes: {
    title: string;
    date: string;
    location: string;
    attendees: string[];
    summary: { topic: string; content: string }[];
    actionItems: { task: string; assignee: string; deadline: string }[];
  };
  footnotes: { term: string; definition: string }[];
}

export async function processMeetingAudio(
  audioBase64: string, 
  mimeType: string, 
  existingAttendees: Record<string, string> = {}
): Promise<MeetingAnalysis> {
  const model = "gemini-3-flash-preview";
  
  const attendeeContext = Object.entries(existingAttendees)
    .map(([id, name]) => `${id}: ${name}`)
    .join(", ");

  const prompt = `
    Please transcribe this audio accurately and generate meeting minutes.
    전문 엔지니어가 정리하듯 상황에 맞게 논리적이고 구조적으로 구성해줘.
    
    1. **Diarization**: Distinguish between different speakers. 
       - Default names: "참석자1", "참석자2", etc., in order of appearance.
       - Use this context for known speakers: ${attendeeContext || "None"}.
    
    2. **Meeting Minutes**:
       - Generate a title ("회의 제목").
       - Identify the date ("회의일시") and location ("회의장소") if mentioned, otherwise use defaults.
       - List all attendees ("참석자 명단").
       - Group the content by topic ("회의 내용").
       - Extract Action Items ("납기 및 담당자"): If tasks, deadlines, or assignees are mentioned, extract them into a separate list.
    
    3. **Technical Footnotes**:
       - Identify any complex engineering or technical terms used **EXACTLY AS THEY APPEAR IN THE TRANSCRIPTION**.
       - Do not invent or add terms that are not mentioned in the audio.
       - Provide clear, professional definitions for them.
    
    Format the output as JSON with the following structure:
    {
      "transcription": [
        { "speaker": "참석자1", "text": "..." }
      ],
      "minutes": {
        "title": "...",
        "date": "...",
        "location": "...",
        "attendees": ["...", "..."],
        "summary": [
          { "topic": "...", "content": "..." }
        ],
        "actionItems": [
          { "task": "...", "assignee": "...", "deadline": "..." }
        ]
      },
      "footnotes": [
        { "term": "...", "definition": "..." }
      ]
    }
    
    IMPORTANT: The language of the transcription and minutes should be Korean (한국어).
  `;

  const response = await ai.models.generateContent({
    model,
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
    config: {
      responseMimeType: "application/json",
    },
  });

  try {
    const text = response.text || "{}";
    // Remove potential markdown code blocks
    const cleanJson = text.replace(/```json\n?|```/g, "").trim();
    const parsed = JSON.parse(cleanJson);
    
    // Basic validation
    if (!parsed.transcription) parsed.transcription = [];
    if (!parsed.minutes) parsed.minutes = { title: "회의록", date: "", location: "", attendees: [], summary: [] };
    if (!parsed.footnotes) parsed.footnotes = [];
    
    return parsed;
  } catch (e) {
    console.error("Failed to parse Gemini response:", response.text, e);
    throw new Error("AI 분석 결과 해석에 실패했습니다. 다시 시도해주세요.");
  }
}
