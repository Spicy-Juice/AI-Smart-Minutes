import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  Square, 
  History, 
  Sparkles, 
  Trash2, 
  Copy, 
  Check, 
  Clock, 
  Calendar,
  Settings,
  Info,
  Play,
  Download,
  Share2,
  FileText,
  Zap,
  MessageSquare,
  ListTodo,
  Smile,
  Users,
  MapPin,
  Save,
  UserPlus,
  Edit3,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { processMeetingAudio, MeetingAnalysis } from './lib/gemini';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

interface SpeakerMap {
  [id: string]: string;
}

interface MeetingSession {
  id: string;
  startTime: number;
  date: string;
  title: string;
  location: string;
  attendees: string[];
  transcription: { speaker: string; text: string }[];
  summary: { topic: string; content: string }[];
  actionItems?: { task: string; assignee: string; deadline: string }[];
  footnotes: { term: string; definition: string }[];
  isConfirmed: boolean;
}

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatDateFull = (ts: number) => {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(ts));
};

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [sessions, setSessions] = useState<MeetingSession[]>([]);
  const [currentSession, setCurrentSession] = useState<MeetingSession | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [speakerMap, setSpeakerMap] = useState<SpeakerMap>({});
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const pdfRef = useRef<HTMLDivElement>(null);

  // Load data from localStorage
  useEffect(() => {
    const savedSessions = localStorage.getItem('meeting-sessions');
    const savedSpeakers = localStorage.getItem('meeting-speaker-map');
    if (savedSessions) setSessions(JSON.parse(savedSessions));
    if (savedSpeakers) setSpeakerMap(JSON.parse(savedSpeakers));
  }, []);

  // Save data to localStorage
  useEffect(() => {
    localStorage.setItem('meeting-sessions', JSON.stringify(sessions));
    localStorage.setItem('meeting-speaker-map', JSON.stringify(speakerMap));
  }, [sessions, speakerMap]);

  const processAudio = async (base64Audio: string, mimeType: string, sessionId: string, startTime: number) => {
    setIsProcessing(true);
    console.log('Starting audio processing...', { sessionId, mimeType, base64Length: base64Audio.length });
    
    try {
      const result = await processMeetingAudio(base64Audio, mimeType, speakerMap);
      console.log('AI Analysis Result received:', result);
      
      if (!result || !result.transcription || result.transcription.length === 0) {
        throw new Error('AI가 대화 내용을 인식하지 못했습니다. 마이크 상태를 확인하고 다시 시도해주세요.');
      }

      const updatedSession: MeetingSession = {
        id: sessionId,
        startTime: startTime,
        date: formatDateFull(startTime),
        title: result.minutes.title || "새로운 회의",
        location: "00회의실",
        attendees: result.minutes.attendees || [],
        transcription: result.transcription,
        summary: result.minutes.summary || [],
        actionItems: result.minutes.actionItems || [],
        footnotes: result.footnotes || [],
        isConfirmed: false
      };

      setSessions(prev => {
        const exists = prev.find(s => s.id === sessionId);
        if (exists) {
          return prev.map(s => s.id === sessionId ? updatedSession : s);
        }
        return [updatedSession, ...prev];
      });
      
      setCurrentSession(updatedSession);
    } catch (err: any) {
      console.error('Processing error details:', err);
      const errorMessage = err.message || '회의록 생성 중 오류가 발생했습니다.';
      alert(errorMessage);
      
      // Update session to show error state instead of infinite loading
      setCurrentSession(prev => {
        if (prev && prev.id === sessionId) {
          return { ...prev, title: "회의록 생성 실패" };
        }
        return prev;
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const startMeeting = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      const now = Date.now();
      const sessionId = now.toString();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        console.log('Recording stopped. Chunks count:', audioChunksRef.current.length);
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        if (audioBlob.size === 0) {
          console.error('Audio blob is empty');
          alert('녹음된 데이터가 없습니다.');
          return;
        }

        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          await processAudio(base64Audio, 'audio/webm', sessionId, now);
        };
      };

      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setRecordingTime(0);
      
      // Initialize session with start time
      setCurrentSession({
        id: sessionId,
        startTime: now,
        date: formatDateFull(now),
        title: "회의 중...",
        location: "00회의실",
        attendees: [],
        transcription: [],
        summary: [],
        actionItems: [],
        footnotes: [],
        isConfirmed: false
      });

      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone access failed:', err);
      alert('마이크 접근에 실패했습니다. 권한을 확인해주세요.');
    }
  };

  const stopMeeting = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };


  const updateAttendeeName = (oldName: string, newName: string) => {
    if (!currentSession) return;

    // Update speaker map for future sessions
    setSpeakerMap(prev => ({ ...prev, [oldName]: newName }));

    // Update current session
    const updatedAttendees = currentSession.attendees.map(a => a === oldName ? newName : a);
    
    const updatedTranscription = currentSession.transcription.map(t => ({
      ...t,
      speaker: t.speaker === oldName ? newName : t.speaker
    }));
    
    const updatedActionItems = currentSession.actionItems?.map(a => ({
      ...a,
      assignee: a.assignee === oldName ? newName : a.assignee
    }));

    setCurrentSession({
      ...currentSession,
      attendees: updatedAttendees,
      transcription: updatedTranscription,
      actionItems: updatedActionItems
    });
  };

  const confirmMeeting = () => {
    if (!currentSession) return;
    const confirmed = { ...currentSession, isConfirmed: true };
    setCurrentSession(confirmed);
    setSessions(prev => prev.map(s => s.id === confirmed.id ? confirmed : s));
  };

  const [isExporting, setIsExporting] = useState(false);

  const exportToPDF = async () => {
    if (!currentSession || !pdfRef.current) return;
    
    setIsExporting(true);
    try {
      // Handle potential default import issues with Vite
      const html2canvasFn = typeof html2canvas === 'function' ? html2canvas : (html2canvas as any).default;
      
      if (typeof html2canvasFn !== 'function') {
        throw new Error('html2canvas is not loaded correctly');
      }

      const canvas = await html2canvasFn(pdfRef.current, { 
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 800,
        windowHeight: pdfRef.current.scrollHeight,
        scrollX: 0,
        scrollY: -window.scrollY,
        onclone: (clonedDoc: Document) => {
          // Force a specific width for consistent PDF scaling (desktop-like layout)
          const container = clonedDoc.getElementById('pdf-container');
          if (container) {
            container.style.width = '800px';
            container.style.maxWidth = '800px';
            container.style.margin = '0 auto';
          }

          // Fix for html2canvas unsupported color functions (oklch, color-mix, etc.)
          const styleTags = clonedDoc.querySelectorAll('style');
          styleTags.forEach(tag => {
            if (tag.innerHTML) {
              tag.innerHTML = tag.innerHTML.replace(/(oklch|oklab|lch|lab|color-mix|light-dark)\([^)]+\)/g, 'transparent');
            }
          });
          const elements = clonedDoc.querySelectorAll('*');
          elements.forEach(el => {
            const style = el.getAttribute('style');
            if (style && style.match(/(oklch|oklab|lch|lab|color-mix|light-dark)/)) {
              el.setAttribute('style', style.replace(/(oklch|oklab|lch|lab|color-mix|light-dark)\([^)]+\)/g, 'transparent'));
            }
          });

          // Convert inputs and textareas to divs for better PDF rendering
          const originalInputs = pdfRef.current!.querySelectorAll('input');
          const clonedInputs = clonedDoc.querySelectorAll('input');
          clonedInputs.forEach((input, index) => {
            if (originalInputs[index]) {
              const div = clonedDoc.createElement('div');
              div.innerText = originalInputs[index].value;
              div.className = input.className;
              div.style.whiteSpace = 'pre-wrap';
              div.style.wordBreak = 'break-word';
              div.style.display = 'inline-block';
              div.style.width = '100%';
              input.parentNode?.replaceChild(div, input);
            }
          });

          const originalTextareas = pdfRef.current!.querySelectorAll('textarea');
          const clonedTextareas = clonedDoc.querySelectorAll('textarea');
          clonedTextareas.forEach((ta, index) => {
            if (originalTextareas[index]) {
              const div = clonedDoc.createElement('div');
              div.innerText = originalTextareas[index].value;
              div.className = ta.className;
              div.style.whiteSpace = 'pre-wrap';
              div.style.wordBreak = 'break-word';
              div.style.width = '100%';
              div.style.height = 'auto';
              ta.parentNode?.replaceChild(div, ta);
            }
          });
        }
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      if (!imgProps.width || imgProps.width === 0) {
        throw new Error('Generated canvas is empty');
      }

      // Handle multi-page PDF if content is too long
      const pageHeight = pdf.internal.pageSize.getHeight();
      let heightLeft = pdfHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
        heightLeft -= pageHeight;
      }
      
      const dateStr = new Date(currentSession.startTime).toISOString().split('T')[0];
      const fileName = `${dateStr}_${currentSession.title.replace(/\s+/g, '_')}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error('PDF Export Error:', error);
      alert('PDF 내보내기 중 오류가 발생했습니다. 콘솔을 확인해주세요.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f4f7] text-[#1a1a1a] font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#2d3436] rounded-xl flex items-center justify-center text-white shadow-lg">
            <Mic size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-[#2d3436]">AI 스마트 회의록</h1>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {!isRecording ? (
            <button 
              onClick={startMeeting}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#00b894] text-white rounded-full font-bold hover:bg-[#00a383] transition-all shadow-md active:scale-95"
            >
              <Play size={18} fill="currentColor" />
              회의 시작
            </button>
          ) : (
            <button 
              onClick={stopMeeting}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#d63031] text-white rounded-full font-bold hover:bg-[#c22b2b] transition-all shadow-md animate-pulse"
            >
              <Square size={18} fill="currentColor" />
              회의 종료 ({formatTime(recordingTime)})
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 p-8">
        {/* Left: History & Controls */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Status Card */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Zap size={14} className="text-orange-500" />
              System Status
            </h3>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <span className="text-sm font-medium text-gray-600">AI Engine</span>
                <span className="text-xs font-bold text-green-600 flex items-center gap-1">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  ONLINE
                </span>
              </div>
              {isProcessing && (
                <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-xl text-orange-600 animate-pulse">
                  <Sparkles size={16} />
                  <span className="text-xs font-bold">AI가 회의록을 분석 중입니다...</span>
                </div>
              )}
            </div>
          </div>

          {/* History */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex-1 flex flex-col min-h-[400px]">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <History size={14} />
              Meeting History
            </h3>
            <div className="flex flex-col gap-3 overflow-y-auto max-h-[500px] pr-2 custom-scrollbar">
              {sessions.length === 0 ? (
                <div className="text-center py-12 text-gray-300">
                  <p className="text-sm">저장된 회의가 없습니다.</p>
                </div>
              ) : (
                sessions.map(s => (
                  <button 
                    key={s.id}
                    onClick={() => setCurrentSession(s)}
                    className={`text-left p-4 rounded-2xl border transition-all ${
                      currentSession?.id === s.id 
                        ? 'bg-[#2d3436] text-white border-[#2d3436] shadow-lg' 
                        : 'bg-white border-gray-100 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-[10px] font-bold opacity-60 mb-1">{new Date(s.startTime).toLocaleDateString()}</div>
                    <div className="font-bold text-sm truncate">{s.title}</div>
                    <div className="flex items-center gap-2 mt-2 opacity-60 text-[10px]">
                      <MapPin size={10} />
                      {s.location}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right: Meeting Content */}
        <div className="lg:col-span-8">
          <AnimatePresence mode="wait">
            {currentSession ? (
              <motion.div 
                key={currentSession.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-6"
              >
                {/* Action Bar */}
                <div className="flex justify-end gap-3">
                  {!currentSession.isConfirmed ? (
                    <button 
                      onClick={confirmMeeting}
                      className="flex items-center gap-2 px-5 py-2 bg-[#2d3436] text-white rounded-xl font-bold hover:bg-black transition-all shadow-md"
                    >
                      <CheckCircle2 size={18} />
                      Confirm
                    </button>
                  ) : (
                    <button 
                      onClick={exportToPDF}
                      disabled={isExporting}
                      className="flex items-center gap-2 px-5 py-2 bg-white border-2 border-[#2d3436] text-[#2d3436] rounded-xl font-bold hover:bg-gray-50 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Download size={18} />
                      {isExporting ? '생성 중...' : 'PDF 내보내기'}
                    </button>
                  )}
                </div>

                {/* Main Document */}
                <div id="pdf-container" ref={pdfRef} className="bg-white rounded-[40px] shadow-2xl p-12 border border-gray-100 min-h-[800px] relative">
                  {/* Watermark for confirmed */}
                  {currentSession.isConfirmed && (
                    <div className="absolute top-10 right-10 text-[#22c55e33] rotate-12 pointer-events-none">
                      <CheckCircle2 size={120} />
                    </div>
                  )}

                  {/* Header Info */}
                  <div className="border-b-4 border-[#2d3436] pb-8 mb-10">
                    <div className="flex items-center gap-2 text-xs font-black text-orange-500 uppercase tracking-[0.4em] mb-4">
                      <Sparkles size={14} />
                      AI Generated Minutes
                    </div>
                    <input 
                      type="text"
                      value={currentSession.title}
                      onChange={(e) => setCurrentSession({...currentSession, title: e.target.value})}
                      className="text-4xl font-black tracking-tight w-full bg-transparent border-none focus:ring-0 p-0 mb-6"
                      placeholder="회의 제목을 입력하세요"
                    />
                    
                    <div className="grid grid-cols-2 gap-8">
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">회의일시</label>
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
                          <Clock size={14} className="text-gray-300" />
                          <input 
                            type="text"
                            value={currentSession.date || formatDateFull(currentSession.startTime)}
                            onChange={(e) => setCurrentSession({...currentSession, date: e.target.value})}
                            className="bg-transparent border-none focus:ring-0 p-0 text-sm font-bold w-full"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">회의장소</label>
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
                          <MapPin size={14} className="text-gray-300" />
                          <input 
                            type="text"
                            value={currentSession.location}
                            onChange={(e) => setCurrentSession({...currentSession, location: e.target.value})}
                            className="bg-transparent border-none focus:ring-0 p-0 text-sm font-bold"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Attendees */}
                  <div className="mb-12">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <Users size={14} />
                      참석자 명단
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {currentSession.attendees.map((name, idx) => (
                        <div key={idx} className="group relative">
                          <input 
                            type="text"
                            value={name}
                            onChange={(e) => updateAttendeeName(name, e.target.value)}
                            className="px-4 py-2 bg-gray-50 border border-gray-100 rounded-full text-xs font-bold text-gray-600 hover:border-orange-200 focus:bg-white focus:border-orange-500 transition-all outline-none"
                          />
                          <Edit3 size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 opacity-0 group-hover:opacity-100" />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Summary (Minutes) */}
                  <div className="mb-12">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                      <ListTodo size={14} />
                      회의 요약
                    </h4>
                    <div className="flex flex-col gap-8">
                      {currentSession.summary.map((item, idx) => (
                        <div key={idx} className="relative pl-6 border-l-2 border-orange-100 group">
                          <div className="absolute -left-[5px] top-1.5 w-2 h-2 bg-orange-500 rounded-full" />
                          <input
                            type="text"
                            value={item.topic}
                            onChange={(e) => {
                              const newSummary = [...currentSession.summary];
                              newSummary[idx] = { ...item, topic: e.target.value };
                              setCurrentSession({ ...currentSession, summary: newSummary });
                            }}
                            className="font-black text-lg mb-2 text-[#2d3436] w-full bg-transparent border-none focus:ring-0 p-0"
                            placeholder="주제"
                          />
                          <textarea
                            value={item.content}
                            onChange={(e) => {
                              const newSummary = [...currentSession.summary];
                              newSummary[idx] = { ...item, content: e.target.value };
                              setCurrentSession({ ...currentSession, summary: newSummary });
                            }}
                            className="text-gray-600 leading-relaxed text-sm w-full bg-transparent border-none focus:ring-0 p-0 resize-none min-h-[60px]"
                            placeholder="내용"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Action Items */}
                  {currentSession.actionItems && currentSession.actionItems.length > 0 && (
                    <div className="mb-12 pt-12 border-t border-gray-100">
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                        <CheckCircle2 size={14} />
                        납기 및 담당자 (Action Items)
                      </h4>
                      <div className="flex flex-col gap-4">
                        {currentSession.actionItems.map((item, idx) => (
                          <div key={idx} className="flex flex-col sm:flex-row gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                            <div className="flex-1">
                              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Task</label>
                              <input
                                type="text"
                                value={item.task}
                                onChange={(e) => {
                                  const newItems = [...currentSession.actionItems!];
                                  newItems[idx] = { ...item, task: e.target.value };
                                  setCurrentSession({ ...currentSession, actionItems: newItems });
                                }}
                                className="text-sm font-bold text-[#2d3436] w-full bg-transparent border-none focus:ring-0 p-0"
                                placeholder="작업 내용"
                              />
                            </div>
                            <div className="w-full sm:w-32">
                              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Assignee</label>
                              <input
                                type="text"
                                value={item.assignee}
                                onChange={(e) => {
                                  const newItems = [...currentSession.actionItems!];
                                  newItems[idx] = { ...item, assignee: e.target.value };
                                  setCurrentSession({ ...currentSession, actionItems: newItems });
                                }}
                                className="text-sm text-gray-600 w-full bg-transparent border-none focus:ring-0 p-0"
                                placeholder="담당자"
                              />
                            </div>
                            <div className="w-full sm:w-32">
                              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Deadline</label>
                              <input
                                type="text"
                                value={item.deadline}
                                onChange={(e) => {
                                  const newItems = [...currentSession.actionItems!];
                                  newItems[idx] = { ...item, deadline: e.target.value };
                                  setCurrentSession({ ...currentSession, actionItems: newItems });
                                }}
                                className="text-sm text-orange-600 font-bold w-full bg-transparent border-none focus:ring-0 p-0"
                                placeholder="기한"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Full Transcript */}
                  <div className="mb-12 pt-12 border-t border-gray-100">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                      <MessageSquare size={14} />
                      상세 대화록
                    </h4>
                    <div className="flex flex-col gap-4">
                      {currentSession.transcription.map((t, idx) => (
                        <div key={idx} className="flex gap-4">
                          <div className="w-20 flex-shrink-0 text-[10px] font-black text-orange-500 uppercase pt-1">
                            {t.speaker}
                          </div>
                          <div className="flex-1 text-sm text-gray-700 leading-relaxed">
                            {t.text}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Footnotes */}
                  {currentSession.footnotes.length > 0 && (
                    <div className="mt-12 pt-8 border-t-2 border-dashed border-gray-100">
                      <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
                        Engineering Footnotes
                      </h4>
                      <div className="grid grid-cols-1 gap-3">
                        {currentSession.footnotes.map((fn, idx) => (
                          <div key={idx} className="text-[11px] text-gray-500 italic">
                            <span className="font-bold text-gray-700">[{fn.term}]</span>: {fn.definition}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <div className="h-full min-h-[600px] flex flex-col items-center justify-center text-center p-12 bg-white rounded-[40px] border-2 border-dashed border-gray-200">
                <div className="w-24 h-24 bg-gray-50 rounded-3xl flex items-center justify-center text-gray-200 mb-8">
                  <Play size={48} fill="currentColor" />
                </div>
                <h2 className="text-2xl font-black text-[#2d3436] mb-4">새로운 회의를 시작하세요</h2>
                <p className="text-gray-400 max-w-sm leading-relaxed">
                  상단의 '회의 시작' 버튼을 눌러 실시간 음성 인식을 통한 스마트 회의록 작성을 시작할 수 있습니다.
                </p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e5e7eb;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #d1d5db;
        }
      `}</style>
    </div>
  );
}
