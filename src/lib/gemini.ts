// 1. 패키지명을 확인하세요. 보통 @google/generative-ai 를 사용합니다.
import { GoogleGenerativeAI } from "@google/generative-ai";

// 2. 환경 변수 이름을 VITE_ 접두사가 붙은 것으로 변경
// Vercel 대시보드에도 이름을 VITE_GEMINI_API_KEY로 등록해야 합니다.
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

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
  // 모델명 확인 (일반적으로 gemini-1.5-flash 등을 사용합니다)
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  
  const attendeeContext = Object.entries(existingAttendees)
    .map(([id, name]) => `${id}: ${name}`)
    .join(", ");

  const prompt = `
    Please transcribe this audio accurately and generate meeting minutes...
    (이하 프롬프트 내용은 동일)
  `;

  // SDK 표준 호출 방식 (ai.models.generateContent 대신 model.generateContent)
  const result = await model.generateContent([
    { text: prompt },
    {
      inlineData: {
        data: audioBase64,
        mimeType: mimeType,
      },
    },
  ]);

  const response = await result.response;
  const text = response.text();

  try {
    // JSON 응답 모드 설정을 위해 config에 넣는 대신 수동 파싱 유지 시
    const cleanJson = text.replace(/```json\n?|```/g, "").trim();
    const parsed = JSON.parse(cleanJson);
    
    if (!parsed.transcription) parsed.transcription = [];
    if (!parsed.minutes) parsed.minutes = { title: "회의록", date: "", location: "", attendees: [], summary: [] };
    if (!parsed.footnotes) parsed.footnotes = [];
    
    return parsed;
  } catch (e) {
    console.error("Failed to parse Gemini response:", text, e);
    throw new Error("AI 분석 결과 해석에 실패했습니다. 다시 시도해주세요.");
  }
}
