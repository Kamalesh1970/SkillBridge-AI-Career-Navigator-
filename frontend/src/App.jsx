import React, { useState, useEffect } from 'react';
import { 
  Upload, 
  FileText, 
  Award, 
  Map, 
  MessageSquare, 
  ArrowRight, 
  Plus, 
  X, 
  CheckCircle, 
  AlertTriangle, 
  HelpCircle, 
  BookOpen, 
  Send, 
  RefreshCw,
  Zap,
  TrendingUp,
  User
} from 'lucide-react';

const API_BASE = "http://localhost:8000";

// Helper to fetch with timeout
const fetchWithTimeout = async (url, options = {}, timeoutMs = 20000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error("Request timed out after 20 seconds. Please try again.");
    }
    throw error;
  }
};

// Helper to format fetch errors nicely
const formatFetchError = (err, defaultMsg) => {
  if (err.message && (err.message.includes("Failed to fetch") || err.message.includes("NetworkError") || err.message.includes("Failed to execute 'fetch'"))) {
    return "Could not reach the backend server. Please verify the backend is running and try again.";
  }
  return err.message || defaultMsg;
};

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState('upload'); // 'upload', 'learning', 'interview'
  
  // Data States
  const [resumeText, setResumeText] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [isExtracting, setIsExtracting] = useState(false);
  
  // Extracted States
  const [extractedSkills, setExtractedSkills] = useState([]);
  const [extractedProjects, setExtractedProjects] = useState([]);
  const [experienceLevel, setExperienceLevel] = useState('');
  const [skillInput, setSkillInput] = useState('');
  
  // Roles Dropdown
  const [rolesList, setRolesList] = useState([]);
  const [selectedRole, setSelectedRole] = useState('');
  const [customRoleInput, setCustomRoleInput] = useState('');
  const [isLoadingRoles, setIsLoadingRoles] = useState(false);

  const getEffectiveRole = () => {
    if (selectedRole === 'Other (custom)') {
      return `Other (custom) - ${customRoleInput.trim() || 'Custom Role'}`;
    }
    return selectedRole;
  };
  
  // Gap Analysis
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [gapResults, setGapResults] = useState(null);
  
  // Learning Path
  const [isGeneratingPath, setIsGeneratingPath] = useState(false);
  const [learningPath, setLearningPath] = useState(null);
  
  // Interview State
  const [isInterviewing, setIsInterviewing] = useState(false);
  const [interviewHistory, setInterviewHistory] = useState([]); // [{role: 'assistant'|'user', content: ''}]
  const [lastFeedback, setLastFeedback] = useState('');
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [isInterviewFinished, setIsInterviewFinished] = useState(false);
  const [interviewStarted, setInterviewStarted] = useState(false);

  // Global Error Notification
  const [errorMessage, setErrorMessage] = useState('');
  const [showReasoning, setShowReasoning] = useState(false);
  const [scorecard, setScorecard] = useState(null);

  // Load Job Roles on startup
  useEffect(() => {
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    setIsLoadingRoles(true);
    try {
      const res = await fetchWithTimeout(`${API_BASE}/roles`, {}, 10000);
      if (!res.ok) throw new Error("Could not retrieve job roles list.");
      const data = await res.json();
      const fullList = [...data, "Other (custom)"];
      setRolesList(fullList);
      if (fullList.length > 0) setSelectedRole(fullList[0]);
    } catch (err) {
      console.error(err);
      setErrorMessage(formatFetchError(err, "Backend is offline or unreachable. Ensure the FastAPI server is running on port 8000."));
    } finally {
      setIsLoadingRoles(false);
    }
  };

  // Skill Ingestion: Handle Parsing
  const handleIngestion = async (e) => {
    e.preventDefault();
    if (!uploadFile && !resumeText.trim()) {
      setErrorMessage("Please paste resume text or select a PDF/TXT file.");
      return;
    }
    
    setIsExtracting(true);
    setErrorMessage('');
    
    try {
      let res;
      if (uploadFile) {
        const formData = new FormData();
        formData.append("file", uploadFile);
        res = await fetchWithTimeout(`${API_BASE}/analyze/extract-skills`, {
          method: "POST",
          body: formData,
        }, 20000);
      } else {
        const formData = new FormData();
        formData.append("resume_text", resumeText);
        res = await fetchWithTimeout(`${API_BASE}/analyze/extract-skills`, {
          method: "POST",
          body: formData,
        }, 20000);
      }
      
      if (!res.ok) {
        const errDetail = await res.json();
        throw new Error(errDetail.detail || "Failed to extract skills from resume.");
      }
      
      const data = await res.json();
      setExtractedSkills(data.skills);
      setExtractedProjects(data.projects);
      setExperienceLevel(data.experience_level);
      
    } catch (err) {
      console.error(err);
      setErrorMessage(formatFetchError(err, "Skill extraction failed."));
    } finally {
      setIsExtracting(false);
    }
  };

  // Confirm and Add/Remove Skills Custom Handling
  const addSkill = () => {
    if (skillInput.trim() && !extractedSkills.includes(skillInput.trim())) {
      setExtractedSkills([...extractedSkills, skillInput.trim()]);
      setSkillInput('');
    }
  };

  const removeSkill = (indexToRemove) => {
    setExtractedSkills(extractedSkills.filter((_, idx) => idx !== indexToRemove));
  };

  // Trigger Gap Analysis
  const runGapAnalysis = async () => {
    if (extractedSkills.length === 0) {
      setErrorMessage("Please extract or input skills first.");
      return;
    }
    
    setIsAnalyzing(true);
    setErrorMessage('');
    setGapResults(null);
    setLearningPath(null); // Clear outdated path
    
    try {
      const res = await fetchWithTimeout(`${API_BASE}/analyze/gap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skills: extractedSkills,
          target_role: getEffectiveRole()
        })
      }, 20000);
      
      if (!res.ok) {
        const errDetail = await res.json();
        throw new Error(errDetail.detail || "Failed to analyze skills gap.");
      }
      
      const data = await res.json();
      setGapResults(data);
    } catch (err) {
      console.error(err);
      setErrorMessage(formatFetchError(err, "Skill-Gap Analysis failed."));
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Generate Learning Path
  const runLearningPath = async () => {
    if (!gapResults) return;
    
    setIsGeneratingPath(true);
    setErrorMessage('');
    
    try {
      const res = await fetchWithTimeout(`${API_BASE}/learning-path`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missing_skills: gapResults.missing,
          partial_skills: gapResults.partial,
          target_role: getEffectiveRole()
        })
      }, 20000);
      
      if (!res.ok) {
        const errDetail = await res.json();
        throw new Error(errDetail.detail || "Failed to generate learning path.");
      }
      
      const data = await res.json();
      setLearningPath(data.roadmap);
      setActiveTab('learning'); // Auto switch to roadmap tab
    } catch (err) {
      console.error(err);
      setErrorMessage(formatFetchError(err, "Learning Path generation failed."));
    } finally {
      setIsGeneratingPath(false);
    }
  };

  // Start Interview Turn-by-Turn
  const startInterview = async () => {
    setErrorMessage('');
    setIsInterviewing(true);
    setInterviewHistory([]);
    setLastFeedback('');
    setIsInterviewFinished(false);
    setInterviewStarted(false);
    setScorecard(null);
    
    try {
      const res = await fetchWithTimeout(`${API_BASE}/interview/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_role: getEffectiveRole(),
          history: [],
          candidate_skills: extractedSkills
        })
      }, 20000);
      
      if (!res.ok) throw new Error("Could not start mock interview.");
      const data = await res.json();
      
      setInterviewHistory([{ role: 'assistant', content: data.next_message }]);
      setInterviewStarted(true);
    } catch (err) {
      console.error(err);
      setErrorMessage(formatFetchError(err, "Could not start mock interview."));
    } finally {
      setIsInterviewing(false);
    }
  };

  // Submit Answer Turn
  const submitAnswer = async (userMsg) => {
    if (!userMsg || isSubmittingAnswer) return;
    
    setIsSubmittingAnswer(true);
    setErrorMessage('');
    
    // Optimistic append user message
    const updatedHistory = [...interviewHistory, { role: 'user', content: userMsg }];
    setInterviewHistory(updatedHistory);
    
    try {
      const res = await fetchWithTimeout(`${API_BASE}/interview/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_role: getEffectiveRole(),
          history: updatedHistory,
          candidate_skills: extractedSkills
        })
      }, 20000);
      
      if (!res.ok) throw new Error("Failed to process interview response.");
      const data = await res.json();
      
      if (data.feedback) {
        setLastFeedback(data.feedback);
      }
      
      if (data.is_final) {
        setIsInterviewFinished(true);
        setScorecard(data.next_message);
        setInterviewHistory([...updatedHistory, { role: 'assistant', content: data.next_message }]);
      } else {
        const assistantText = data.feedback 
          ? `${data.feedback}\n\n${data.next_message}` 
          : data.next_message;
        setInterviewHistory([...updatedHistory, { role: 'assistant', content: assistantText }]);
      }
    } catch (err) {
      console.error(err);
      setErrorMessage(formatFetchError(err, "Error submitting answer."));
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] p-4 md:p-8 text-[#111827]">
      <div className="max-w-6xl w-full mx-auto flex flex-col flex-1 gap-6">
        
        {/* Simple Editorial Header */}
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-[#E5E7EB]">
          <div className="flex items-center gap-3">
            <div className="bg-[#1F2937] p-2 rounded-md text-white select-none">
              <GraduationCapIcon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-display tracking-tight text-[#111827]">SkillBridge</h1>
              <p className="text-xs text-[#6B7280]">AI-Powered Career Vector Navigator</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="minimal-badge minimal-badge-neutral uppercase tracking-wider text-[10px] select-none">
              ONLINE
            </span>
            <span className="text-xs text-[#6B7280] font-mono">
              Model: GPT-MOCK-v3
            </span>
          </div>
        </header>

        {/* Vector Selection Toolbar */}
        <div className="minimal-card p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 select-none">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4 w-full">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-2 w-full md:w-auto">
              <label className="text-xs font-bold text-[#111827] uppercase tracking-wide whitespace-nowrap">
                Target Career Vector:
              </label>
              <select
                value={selectedRole}
                onChange={(e) => {
                  setSelectedRole(e.target.value);
                  setGapResults(null);
                  setLearningPath(null);
                  setInterviewHistory([]);
                  setLastFeedback('');
                  setIsInterviewFinished(false);
                  setInterviewStarted(false);
                  setScorecard(null);
                }}
                disabled={isLoadingRoles}
                className="minimal-input py-1.5 px-3 text-xs w-full md:w-64 cursor-pointer"
              >
                {rolesList.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>

            {selectedRole === 'Other (custom)' && (
              <div className="flex flex-col md:flex-row items-start md:items-center gap-2 w-full md:w-auto">
                <label className="text-xs font-bold text-[#111827] uppercase tracking-wide whitespace-nowrap">
                  Custom Title:
                </label>
                <input
                  type="text"
                  placeholder="e.g. Site Reliability Engineer"
                  value={customRoleInput}
                  onChange={(e) => {
                    setCustomRoleInput(e.target.value);
                    setGapResults(null);
                    setLearningPath(null);
                    setInterviewHistory([]);
                    setLastFeedback('');
                    setIsInterviewFinished(false);
                    setInterviewStarted(false);
                    setScorecard(null);
                  }}
                  className="minimal-input py-1.5 px-3 text-xs w-full md:w-64"
                />
              </div>
            )}
          </div>
        </div>

        {/* Main Content Container */}
        <main className="flex-1 flex flex-col gap-6">
          
          {/* System Error Message */}
          {errorMessage && (
            <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg flex items-start gap-3 text-xs">
              <AlertTriangle className="h-5 w-5 text-red-700 flex-shrink-0" />
              <div className="flex-1">
                <span className="font-bold uppercase tracking-wider mr-1.5">ALERT:</span> {errorMessage}
              </div>
              <button onClick={() => setErrorMessage('')} className="text-red-800 hover:text-red-950 font-bold ml-auto text-base leading-none">
                ✕
              </button>
            </div>
          )}

          {/* Simple Tab Underline Bar */}
          <div className="flex gap-2 border-b border-[#E5E7EB] pb-px select-none">
            <button
              onClick={() => setActiveTab('upload')}
              className={`py-2 px-4 text-xs font-semibold border-b-2 -mb-px transition-all ${
                activeTab === 'upload'
                  ? 'border-[#1F2937] text-[#111827]'
                  : 'border-transparent text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              1. Ingestion
            </button>
            
            <button
              onClick={() => {
                if (!gapResults) {
                  setErrorMessage("Please complete the Skill-Gap Analysis under 'Ingestion' tab first.");
                  return;
                }
                setActiveTab('learning');
              }}
              className={`py-2 px-4 text-xs font-semibold border-b-2 -mb-px transition-all ${
                !gapResults ? 'opacity-40 cursor-not-allowed' : ''
              } ${
                activeTab === 'learning'
                  ? 'border-[#1F2937] text-[#111827]'
                  : 'border-transparent text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              2. Roadmap
            </button>
            
            <button
              onClick={() => setActiveTab('interview')}
              className={`py-2 px-4 text-xs font-semibold border-b-2 -mb-px transition-all ${
                activeTab === 'interview'
                  ? 'border-[#1F2937] text-[#111827]'
                  : 'border-transparent text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              3. Mock Session
            </button>
          </div>

          {/* TAB 1: UPLOAD & ANALYZE */}
          {activeTab === 'upload' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            
            {/* Input Ingestion Form */}
            <div className="minimal-card p-6 flex flex-col gap-4">
              <h3 className="text-sm font-bold text-[#111827] font-display flex items-center gap-2 border-b border-[#E5E7EB] pb-2 select-none">
                <FileText className="h-4 w-4 text-[#6B7280]" />
                Resume & Skill Ingestion
              </h3>
              <p className="text-xs text-[#6B7280] leading-relaxed">
                Upload your resume in PDF/TXT format or paste the plaintext contents below. Our analyzer will identify your skill nodes dynamically.
              </p>
              
              <form onSubmit={handleIngestion} className="space-y-4">
                {/* File Upload Box */}
                <div className="border border-dashed border-[#D1D5DB] hover:border-[#9CA3AF] p-6 bg-white hover:bg-slate-50 transition-all select-none rounded-lg text-center cursor-pointer">
                  <input
                    type="file"
                    id="file-upload"
                    accept=".pdf,.txt"
                    onChange={(e) => setUploadFile(e.target.files[0])}
                    className="hidden"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-2">
                    <div className="bg-[#F3F4F6] p-2 text-[#374151] rounded-full w-9 h-9 flex items-center justify-center mb-1">
                      <Upload className="h-4 w-4" />
                    </div>
                    {uploadFile ? (
                      <span className="text-xs text-[#2F5C47] font-mono font-bold">{uploadFile.name}</span>
                    ) : (
                      <>
                        <span className="text-xs font-semibold text-[#111827]">Drag & drop or browse</span>
                        <span className="text-[10px] text-[#6B7280]">Supports PDF, TXT</span>
                      </>
                    )}
                  </label>
                </div>

                <div className="text-center text-[10px] text-[#9CA3AF] font-bold tracking-widest my-2 select-none">— OR PASTE DETAILS BELOW —</div>

                {/* Paste Area */}
                <textarea
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  placeholder="Paste details of your projects, skills, education, and work experience..."
                  rows={6}
                  disabled={!!uploadFile}
                  className="w-full minimal-input p-3 focus:outline-none focus:ring-0 resize-none text-xs"
                />

                <button
                  type="submit"
                  disabled={isExtracting}
                  className="minimal-button-primary w-full py-2 flex items-center justify-center gap-2 text-xs font-medium"
                >
                  {isExtracting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Parsing Resume Skills...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
                      Extract Resume Skills
                    </>
                  )}
                </button>
              </form>
            </div>
            
            {/* Extracted Skills confirmation & Gap Analysis triggers */}
            <div className="flex flex-col gap-6">
              
              {/* Confirmed Skills Panel */}
              <div className="minimal-card p-6 flex flex-col gap-4">
                <div className="flex justify-between items-center border-b border-[#E5E7EB] pb-2 select-none">
                  <h3 className="text-sm font-bold text-[#111827] font-display flex items-center gap-2">
                    <Award className="h-4 w-4 text-[#6B7280]" />
                    Skills Profile
                  </h3>
                  {experienceLevel && (
                    <span className="minimal-badge minimal-badge-neutral uppercase tracking-wider text-[9px]">
                      {experienceLevel}
                    </span>
                  )}
                </div>

                {extractedSkills.length === 0 ? (
                  <div className="text-center text-[#6B7280] text-xs py-8">
                    No profile loaded yet. Upload your resume or paste text to generate your profile.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Add Custom Skill Box */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={skillInput}
                        onChange={(e) => setSkillInput(e.target.value)}
                        placeholder="Add a missing skill manually..."
                        onKeyDown={(e) => e.key === 'Enter' && addSkill()}
                        className="minimal-input flex-1 py-1.5 px-3 text-xs"
                      />
                      <button
                        onClick={addSkill}
                        className="minimal-button-secondary p-1.5 flex items-center justify-center"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Skill chips */}
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                      {extractedSkills.map((skill, idx) => (
                        <div
                          key={`${skill}-${idx}`}
                          className="minimal-badge minimal-badge-neutral text-[11px] py-1 px-3 flex items-center gap-1.5 select-none"
                        >
                          {skill}
                          <button
                            onClick={() => removeSkill(idx)}
                            className="text-[#6B7280] hover:text-[#A34F4F] transition-colors ml-1 font-bold"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Extracted Projects */}
                    {extractedProjects.length > 0 && (
                      <div className="pt-3 border-t border-[#E5E7EB]">
                        <div className="text-[10px] text-[#6B7280] font-bold font-mono uppercase tracking-wider mb-2 select-none">Identified Projects:</div>
                        <ul className="list-disc pl-4 text-xs text-[#111827] space-y-1 font-sans">
                          {extractedProjects.map((proj, idx) => (
                            <li key={idx}>{proj}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Gap analysis button */}
                    <div className="pt-1">
                      <button
                        onClick={runGapAnalysis}
                        disabled={isAnalyzing}
                        className="minimal-button-primary w-full py-2.5 flex items-center justify-center gap-2 text-xs font-medium"
                      >
                        {isAnalyzing ? (
                          <>
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            Analyzing Gap Against {selectedRole === 'Other (custom)' ? customRoleInput || 'Custom Role' : selectedRole}...
                          </>
                        ) : (
                          <>
                            <TrendingUp className="h-4 w-4" />
                            Perform Skill-Gap Analysis
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* RAG Analysis Results Output */}
              {gapResults && (
                <div className="minimal-card p-6 flex flex-col gap-4">
                  <div className="flex justify-between items-center border-b border-[#E5E7EB] pb-2 select-none">
                    <h3 className="text-sm font-bold text-[#111827] font-display flex items-center gap-2">
                      <Award className="h-4 w-4 text-[#6B7280]" />
                      Skill-Gap Analysis
                    </h3>
                    <div className="text-right">
                      <div className="text-sm font-bold text-[#1F2937] font-display">
                        {gapResults.match_percentage}% MATCH
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar - Minimal styled */}
                  <div className="w-full bg-[#F3F4F6] h-2.5 rounded-full overflow-hidden select-none">
                    <div
                      className="bg-[#1F2937] h-full transition-all duration-1000 ease-out"
                      style={{ width: `${gapResults.match_percentage}%` }}
                    />
                  </div>

                  {/* Curated Skill Chips */}
                  <div className="space-y-3">
                    
                    {/* Matched */}
                    <div>
                      <div className="text-xs text-[#065F46] font-semibold flex items-center gap-1.5 mb-1 select-none">
                        <CheckCircle className="h-3.5 w-3.5" /> Matched Skills ({gapResults.matched.length})
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {gapResults.matched.map((sk) => (
                          <span key={sk} className="minimal-badge minimal-badge-matched">
                            {sk}
                          </span>
                        ))}
                        {gapResults.matched.length === 0 && (
                          <span className="text-xs text-[#6B7280] font-mono">None identified</span>
                        )}
                      </div>
                    </div>

                    {/* Partial */}
                    <div>
                      <div className="text-xs text-[#92400E] font-semibold flex items-center gap-1.5 mb-1 select-none">
                        <HelpCircle className="h-3.5 w-3.5" /> Partial Skills ({gapResults.partial.length})
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {gapResults.partial.map((sk) => (
                          <span key={sk} className="minimal-badge minimal-badge-partial">
                            {sk}
                          </span>
                        ))}
                        {gapResults.partial.length === 0 && (
                          <span className="text-xs text-[#6B7280] font-mono">None identified</span>
                        )}
                      </div>
                    </div>

                    {/* Missing */}
                    <div>
                      <div className="text-xs text-[#991B1B] font-semibold flex items-center gap-1.5 mb-1 select-none">
                        <AlertTriangle className="h-3.5 w-3.5" /> Missing Skills ({gapResults.missing.length})
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {gapResults.missing.map((sk) => (
                          <span key={sk} className="minimal-badge minimal-badge-missing">
                            {sk}
                          </span>
                        ))}
                        {gapResults.missing.length === 0 && (
                          <span className="text-xs text-[#6B7280] font-mono">None identified</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="bg-[#FAF9F6] p-4 rounded-lg border border-[#E5E7EB] shadow-sm">
                    <div className="text-[10px] text-[#6B7280] font-bold font-mono uppercase tracking-wider mb-1 select-none">Evaluation Summary:</div>
                    <p className="text-xs text-[#111827] leading-relaxed font-sans">{gapResults.summary}</p>
                  </div>

                  {/* Collapsible Reasoning Section */}
                  {gapResults.reasoning && Object.keys(gapResults.reasoning).length > 0 && (
                    <div className="border border-[#E5E7EB] rounded-lg overflow-hidden bg-white">
                      <button
                        onClick={() => setShowReasoning(!showReasoning)}
                        className="w-full text-left px-4 py-2 flex items-center justify-between text-xs font-semibold text-[#111827] hover:bg-[#FAF9F6] transition-colors"
                      >
                        <span className="flex items-center gap-1.5 select-none">
                          <HelpCircle className="h-4 w-4 text-[#6B7280]" />
                          Diagnostic Breakdown
                        </span>
                        <span>{showReasoning ? '▲' : '▼'}</span>
                      </button>
                      
                      {showReasoning && (
                        <div className="px-4 pb-3 pt-1 space-y-2 border-t border-[#E5E7EB] bg-[#FAF9F6] max-h-48 overflow-y-auto">
                          {Object.entries(gapResults.reasoning).map(([skill, reason]) => {
                            const isMatched = gapResults.matched.some(s => s.toLowerCase() === skill.toLowerCase());
                            const isPartial = gapResults.partial.some(s => s.toLowerCase() === skill.toLowerCase());
                            
                            let badgeStyle = "minimal-badge-missing";
                            let category = "Missing";
                            
                            if (isMatched) {
                              badgeStyle = "minimal-badge-matched";
                              category = "Matched";
                            } else if (isPartial) {
                              badgeStyle = "minimal-badge-partial";
                              category = "Partial";
                            }
                            
                            return (
                              <div key={skill} className="text-xs border-b border-[#E5E7EB]/50 pb-2 last:border-b-0 last:pb-0 pt-1">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <span className="font-bold text-[#111827]">{skill}</span>
                                  <span className={`minimal-badge ${badgeStyle} text-[9px]`}>
                                    {category}
                                  </span>
                                </div>
                                <p className="text-[#374151] leading-relaxed text-[11px] font-sans">{reason}</p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Roadmap Action Button */}
                  <div className="pt-2">
                    <button
                      onClick={runLearningPath}
                      disabled={isGeneratingPath || (gapResults.missing.length === 0 && gapResults.partial.length === 0)}
                      className="minimal-button-primary w-full py-2.5 flex items-center justify-center gap-2 text-xs font-semibold"
                    >
                      {isGeneratingPath ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Curating Course Path...
                        </>
                      ) : (
                        <>
                          <BookOpen className="h-4 w-4" />
                          Generate Personalized Learning Path
                          <ArrowRight className="h-3.5 w-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: LEARNING PATH */}
        {activeTab === 'learning' && (
          <div className="minimal-card p-6 flex flex-col gap-4 max-w-4xl mx-auto w-full">
            <h3 className="text-sm font-bold text-[#111827] font-display flex items-center gap-2 border-b border-[#E5E7EB] pb-2 select-none">
              <Map className="h-4 w-4 text-[#6B7280]" />
              Personalized Learning Roadmap
            </h3>

            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-2 select-none">
              <span className="text-xs text-[#6B7280]">
                Target Vector: <span className="font-semibold text-[#111827]">{selectedRole === 'Other (custom)' ? customRoleInput || 'Custom Role' : selectedRole}</span>
              </span>
              <button 
                onClick={runLearningPath}
                disabled={isGeneratingPath}
                className="minimal-button-secondary py-1 px-3 text-xs flex items-center gap-1.5"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isGeneratingPath ? 'animate-spin' : ''}`} />
                Regenerate Path
              </button>
            </div>

            <div>
              {learningPath ? (
                learningPath.length > 0 ? (
                  <div className="relative pl-6 md:pl-8 border-l-2 border-[#E5E7EB] space-y-6 my-4">
                    {learningPath.map((step, idx) => (
                      <div key={idx} className="relative">
                        {/* Node Dot */}
                        <span className="absolute -left-[31px] md:-left-[39px] top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#1F2937] text-[10px] font-bold text-white font-mono shadow-sm">
                          {idx + 1}
                        </span>
                        
                        {/* Roadmap step card */}
                        <div className="minimal-card p-5 flex flex-col gap-3">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-[#E5E7EB] pb-1.5">
                            <h4 className="text-xs font-bold text-[#111827]">{step.skill}</h4>
                            <span className="minimal-badge minimal-badge-neutral text-[10px] self-start md:self-auto">
                              EST. TIME: {step.learning_time}
                            </span>
                          </div>
                          
                          <p className="text-xs text-[#374151] leading-relaxed font-sans">
                            {step.why_it_matters}
                          </p>
                          
                          {/* Resources */}
                          <div>
                            <div className="text-[10px] text-[#6B7280] font-bold font-mono uppercase tracking-wider mb-2">Recommended Study Resources:</div>
                            <div className="flex flex-wrap gap-2">
                              {step.resources.map((res, rIdx) => {
                                const label = typeof res === 'object' && res !== null ? res.label : res;
                                const url = typeof res === 'object' && res !== null ? res.url : `https://www.google.com/search?q=${encodeURIComponent(res)}`;
                                return (
                                  <a
                                    key={rIdx}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="minimal-button-secondary py-1.5 px-3 flex items-center gap-1.5 text-xs text-black w-auto inline-flex select-none"
                                  >
                                    <BookOpen className="h-3.5 w-3.5 text-[#6B7280]" />
                                    <span>{label}</span>
                                  </a>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="minimal-card p-8 text-center max-w-xl mx-auto my-4 flex flex-col items-center gap-3">
                    <div className="bg-emerald-50 text-[#065F46] p-3 rounded-full w-12 h-12 flex items-center justify-center text-xl select-none">🎉</div>
                    <h4 className="text-sm font-bold text-[#111827]">Vector Match Perfect!</h4>
                    <p className="text-xs text-[#6B7280] leading-relaxed">
                      Your skills are a perfect match for the selected role. No skill gaps detected, so you do not need a custom learning path roadmap. You are fully ready for this role!
                    </p>
                  </div>
                )
              ) : (
                <div className="text-center text-[#6B7280] text-xs py-12 bg-white rounded-lg border border-[#E5E7EB]">
                  No learning path generated. Click the generate button on your Gap Analysis report under "Ingestion" tab to build your path.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: MOCK INTERVIEW */}
        {activeTab === 'interview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start max-w-6xl mx-auto w-full">
            
            {/* Left sidebar layout containing status and feedback */}
            <div className="lg:col-span-1 flex flex-col gap-6 select-none">
              
              {/* Interview Controller Card */}
              <div className="minimal-card p-6 flex flex-col gap-4">
                <h3 className="text-sm font-bold text-[#111827] font-display flex items-center gap-2 border-b border-[#E5E7EB] pb-2">
                  <MessageSquare className="h-4 w-4 text-[#6B7280]" />
                  Interview Controller
                </h3>
                <p className="text-xs text-[#6B7280] leading-relaxed font-sans">
                  Conduct a standard 5-question interview tailored to the <span className="font-semibold text-[#111827]">{selectedRole === 'Other (custom)' ? customRoleInput || 'Custom Role' : selectedRole}</span> role. Answer questions fully. At the end, you'll receive a mock scorecard detailing strengths and advice.
                </p>
                <div>
                  <button
                    onClick={startInterview}
                    disabled={isInterviewing}
                    className="minimal-button-primary w-full py-2.5 flex items-center justify-center gap-2 text-xs font-semibold"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {interviewStarted ? "Restart Interview" : "Start Mock Interview"}
                  </button>
                </div>
              </div>

              {/* Turn-by-Turn Immediate Feedback */}
              {lastFeedback && !isInterviewFinished && (
                <div className="minimal-card p-4 bg-white flex flex-col gap-2">
                  <div className="text-[10px] text-[#92400E] font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-[#92400E]" />
                    Last Response Feedback
                  </div>
                  <p className="text-xs text-[#374151] leading-relaxed font-sans italic">
                    "{lastFeedback}"
                  </p>
                </div>
              )}
            </div>

            {/* Chat Box Interface */}
            <div className="minimal-card lg:col-span-2 flex flex-col h-[560px] overflow-hidden bg-white">
              
              {/* Chat Header */}
              <div className="flex justify-between items-center px-6 py-4 border-b border-[#E5E7EB] bg-slate-50 select-none">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-[#6B7280]" />
                  <span className="text-sm font-bold text-[#111827] font-display">Live Mock Session</span>
                </div>
                {interviewStarted && (
                  <span className="minimal-badge minimal-badge-neutral text-[9px] uppercase tracking-wider font-semibold">
                    Stateless Session
                  </span>
                )}
              </div>

              {/* Chat Messages Log */}
              <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-white">
                {!interviewStarted ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-[#6B7280] text-xs gap-3 select-none">
                    <div className="bg-slate-50 p-4 rounded-full text-[#6B7280] w-12 h-12 flex items-center justify-center border border-[#E5E7EB]">
                      <MessageSquare className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="font-bold text-[#111827] font-sans">Session Terminal Ready</p>
                      <p className="text-[10px] text-[#6B7280] max-w-xs mt-1">
                        Click "Start Mock Interview" in the controller to begin.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {interviewHistory.filter(msg => !msg.content.startsWith("### Mock Interview Scorecard")).map((msg, idx) => {
                      const isAssistant = msg.role === 'assistant';
                      return (
                        <div 
                          key={idx} 
                          className={`flex gap-3 max-w-[85%] ${
                            isAssistant ? 'self-start mr-auto' : 'self-end ml-auto flex-row-reverse'
                          }`}
                        >
                          {/* Avatar */}
                          <div className={`h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold font-mono shadow-sm select-none ${
                            isAssistant ? 'bg-[#1F2937] text-white' : 'bg-[#F3F4F6] text-[#374151] border border-[#E5E7EB]'
                          }`}>
                            {isAssistant ? "AI" : <User className="h-4 w-4" />}
                          </div>
                          
                          {/* Text bubble */}
                          <div className={`p-3.5 text-xs leading-relaxed font-sans ${
                            isAssistant 
                              ? 'chat-bubble-assistant shadow-sm' 
                              : 'chat-bubble-user shadow-sm'
                          }`}>
                            <p className="whitespace-pre-line font-medium">{msg.content}</p>
                          </div>
                        </div>
                      );
                    })}

                    {/* Premium Styled Scorecard Component */}
                    {isInterviewFinished && scorecard && (
                      <div className="minimal-card p-6 mt-4 flex flex-col gap-4">
                        <h4 className="text-sm font-bold text-[#111827] font-display flex items-center gap-2 border-b border-[#E5E7EB] pb-2">
                          <Award className="h-4 w-4 text-[#6B7280]" />
                          Mock Interview Scorecard
                        </h4>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Strengths */}
                          <div className="bg-emerald-50/55 border border-emerald-100 p-4 rounded-lg">
                            <div className="text-[10px] font-bold text-[#065F46] mb-2 font-mono uppercase tracking-wider">Key Strengths:</div>
                            <ul className="list-disc pl-4 text-xs text-[#374151] space-y-1.5 leading-relaxed font-sans">
                              {scorecard.includes("**Strengths:**") ? (
                                scorecard.split("**Weaknesses/Gaps:**")[0]
                                  .replace("### Mock Interview Scorecard", "")
                                  .replace("**Strengths:**", "")
                                  .trim()
                                  .split('\n')
                                  .filter(line => line.trim().startsWith('-'))
                                  .map((line, idx) => <li key={idx}>{line.replace('- ', '').trim()}</li>)
                              ) : (
                                <li>Clear explanation of SQL joins and concepts.</li>
                              )}
                            </ul>
                          </div>
                          
                          {/* Weaknesses */}
                          <div className="bg-red-50/55 border border-red-100 p-4 rounded-lg">
                            <div className="text-[10px] font-bold text-[#991B1B] mb-2 font-mono uppercase tracking-wider">Areas to Improve:</div>
                            <ul className="list-disc pl-4 text-xs text-[#374151] space-y-1.5 leading-relaxed font-sans">
                              {scorecard.includes("**Weaknesses/Gaps:**") ? (
                                scorecard.split("**Weaknesses/Gaps:**")[1]
                                  .split("**Actionable Tips:**")[0]
                                  .replace("**Weaknesses/Gaps:**", "")
                                  .trim()
                                  .split('\n')
                                  .filter(line => line.trim().startsWith('-'))
                                  .map((line, idx) => <li key={idx}>{line.replace('- ', '').trim()}</li>)
                              ) : (
                                <li>Could expand more on trade-offs and real-world system patterns.</li>
                              )}
                            </ul>
                          </div>
                        </div>
                        
                        {/* Actionable Advice */}
                        <div className="bg-slate-50 border border-slate-100 p-4 rounded-lg">
                          <div className="text-[10px] font-bold text-[#374151] mb-2 flex items-center gap-1.5 font-mono uppercase tracking-wider">
                            <Zap className="h-3.5 w-3.5 text-[#374151]" /> Actionable Advice:
                          </div>
                          <p className="text-xs text-[#374151] leading-relaxed font-medium">
                            {scorecard.includes("**Actionable Tips:**") ? (
                              scorecard.split("**Actionable Tips:**")[1]
                                .replace("**Actionable Tips:**", "")
                                .replace("- ", "")
                                .trim()
                            ) : (
                              "Practice system design problems and refine explanation structures."
                            )}
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Chat Input form */}
              {interviewStarted && (
                <div className="border-t border-[#E5E7EB] p-4 bg-slate-50 select-none">
                  {isInterviewFinished ? (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3.5 text-center text-[#065F46] text-xs font-semibold font-sans">
                      🎓 Interview successfully completed! You can review your detailed scorecard above.
                    </div>
                  ) : (
                    <ChatForm onSubmit={submitAnswer} isSubmittingAnswer={isSubmittingAnswer} />
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer Info */}
      <footer className="py-8 text-center text-xs text-[#6B7280] border-t border-[#E5E7EB] mt-12 bg-white select-none">
        SkillBridge MVP — Building Decent Work and Economic Growth (SDG 8)
      </footer>
    </div>
  </div>
  );
}

// Icon fallbacks to ensure zero missing symbols
function GraduationCapIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" />
      <path d="M6 18.8v-4L2 13v6a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1z" />
      <path d="M12 14.5v6" />
      <path d="M18 14v5a2.5 2.5 0 0 0 5 0v-5" />
    </svg>
  );
}

// Optimized child component for chat input to isolate keystroke re-renders
function ChatForm({ onSubmit, isSubmittingAnswer }) {
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputValue.trim() || isSubmittingAnswer) return;
    onSubmit(inputValue.trim());
    setInputValue('');
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <textarea
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder="Type your response here..."
        rows={2}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
          }
        }}
        disabled={isSubmittingAnswer}
        className="flex-1 minimal-input py-2.5 px-4 text-xs text-[#111827] placeholder-slate-400 focus:outline-none resize-none disabled:opacity-50 transition-all"
      />
      <button
        type="submit"
        disabled={isSubmittingAnswer || !inputValue.trim()}
        className="minimal-button-primary py-2 px-5 flex items-center justify-center flex-shrink-0 disabled:opacity-50 text-xs font-semibold"
      >
        {isSubmittingAnswer ? (
          <RefreshCw className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
      </button>
    </form>
  );
}
