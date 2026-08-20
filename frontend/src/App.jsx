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
    <div className="min-h-screen flex flex-col">
      {/* Top Hero Header Banner */}
      <header className="glass-panel sticky top-0 z-40 border-b-2 border-black py-4 px-6 md:px-12 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-[#1b4332] p-2.5 rounded-sm border border-black shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)]">
            <GraduationCapIcon className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold tracking-tight shimmer-text">
              SkillBridge
            </h1>
            <p className="text-xs text-gray-600 font-bold tracking-wide">
              AI CAREER NAVIGATOR FOR TIER-2/3 COLLEGE STUDENTS
            </p>
          </div>
        </div>
        
        {/* Core Global Status / Select Role */}
        <div className="flex flex-col md:flex-row items-end gap-4 w-full md:w-auto">
          <div className="flex flex-col w-full md:w-56">
            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">
              Select Target Job Role
            </label>
            <select
              value={selectedRole}
              onChange={(e) => {
                setSelectedRole(e.target.value);
                setGapResults(null);
                setLearningPath(null);
                // Reset interview states to prevent stale results
                setInterviewHistory([]);
                setLastFeedback('');
                setIsInterviewFinished(false);
                setInterviewStarted(false);
                setScorecard(null);
              }}
              disabled={isLoadingRoles}
              className="bg-white border-2 border-black rounded-sm py-1.5 px-3 text-sm text-black font-semibold focus:outline-none focus:border-[#1b4332] transition-colors w-full"
            >
              {rolesList.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </div>

          {selectedRole === 'Other (custom)' && (
            <div className="flex flex-col w-full md:w-56">
              <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">
                Type Custom Role Title
              </label>
              <input
                type="text"
                placeholder="e.g. Site Reliability Engineer"
                value={customRoleInput}
                onChange={(e) => {
                  setCustomRoleInput(e.target.value);
                  setGapResults(null);
                  setLearningPath(null);
                  // Reset interview states
                  setInterviewHistory([]);
                  setLastFeedback('');
                  setIsInterviewFinished(false);
                  setInterviewStarted(false);
                  setScorecard(null);
                }}
                className="bg-white border-2 border-black rounded-sm py-1.5 px-3 text-sm text-black font-semibold focus:outline-none focus:border-[#1b4332] transition-colors w-full"
              />
            </div>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 grid grid-cols-1 gap-6">
        
        {/* Error Modal/Banner */}
        {errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-sm p-4 flex items-start gap-3 text-red-800 text-sm">
            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold text-red-950">System Notification:</span> {errorMessage}
            </div>
            <button onClick={() => setErrorMessage('')} className="hover:text-red-950">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Tab Navigation Bars */}
        <div className="flex overflow-x-auto no-scrollbar border-b border-black gap-1.5 whitespace-nowrap">
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex-shrink-0 flex items-center gap-2 py-3 px-6 text-sm font-semibold rounded-t-sm transition-all border-b-2 ${
              activeTab === 'upload'
                ? 'border-black text-[#1b4332] bg-[#1b4332]/5 font-bold'
                : 'border-transparent text-gray-600 hover:text-[#1b4332]'
            }`}
          >
            <Upload className="h-4 w-4" />
            1. Upload & Analyze
          </button>
          
          <button
            onClick={() => {
              if (!gapResults) {
                setErrorMessage("Please complete the Skill-Gap Analysis under 'Upload & Analyze' first.");
                return;
              }
              setActiveTab('learning');
            }}
            className={`flex-shrink-0 flex items-center gap-2 py-3 px-6 text-sm font-semibold rounded-t-sm transition-all border-b-2 ${
              !gapResults ? 'opacity-50 cursor-not-allowed' : ''
            } ${
              activeTab === 'learning'
                ? 'border-black text-[#1b4332] bg-[#1b4332]/5 font-bold'
                : 'border-transparent text-gray-600 hover:text-[#1b4332]'
            }`}
          >
            <Map className="h-4 w-4" />
            2. Learning Path
          </button>
          
          <button
            onClick={() => setActiveTab('interview')}
            className={`flex-shrink-0 flex items-center gap-2 py-3 px-6 text-sm font-semibold rounded-t-sm transition-all border-b-2 ${
              activeTab === 'interview'
                ? 'border-black text-[#1b4332] bg-[#1b4332]/5 font-bold'
                : 'border-transparent text-gray-600 hover:text-[#1b4332]'
            }`}
          >
            <MessageSquare className="h-4 w-4" />
            3. Mock Interview
          </button>
        </div>

        {/* TAB 1: UPLOAD & ANALYZE */}
        {activeTab === 'upload' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            
            {/* Input Ingestion Form */}
            <div className="glass-panel p-6 rounded-sm flex flex-col gap-5">
              <div className="flex items-center gap-2.5">
                <FileText className="h-5 w-5 text-[#1b4332]" />
                <h2 className="text-lg font-bold text-gray-900">Resume / Skills Ingestion</h2>
              </div>
              <p className="text-sm text-gray-600">
                Upload your resume in PDF/TXT format or paste the plaintext contents below. Our AI will pull and parse your skills dynamically.
              </p>
              
              <form onSubmit={handleIngestion} className="space-y-4">
                {/* File Upload Box */}
                <div className="border-2 border-dashed border-black/30 hover:border-[#1b4332] rounded-sm p-6 transition-all bg-[#f7f6f3]/50 hover:bg-[#f7f6f3] group">
                  <input
                    type="file"
                    id="file-upload"
                    accept=".pdf,.txt"
                    onChange={(e) => setUploadFile(e.target.files[0])}
                    className="hidden"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-2">
                    <div className="bg-[#1b4332]/10 p-3 rounded-sm text-[#1b4332] border border-[#1b4332]/20 group-hover:scale-110 transition-transform">
                      <Upload className="h-6 w-6" />
                    </div>
                    {uploadFile ? (
                      <span className="text-sm text-[#1b4332] font-semibold">{uploadFile.name}</span>
                    ) : (
                      <>
                        <span className="text-sm font-semibold text-gray-800">Drag & drop or browse</span>
                        <span className="text-xs text-gray-500">Supports PDF, TXT</span>
                      </>
                    )}
                  </label>
                </div>

                <div className="text-center text-xs text-gray-500 font-bold">— OR PASTE RESUME —</div>

                {/* Paste Area */}
                <textarea
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  placeholder="Paste details of your projects, skills, education, and work experience..."
                  rows={6}
                  disabled={!!uploadFile}
                  className="w-full bg-white border border-black rounded-sm p-4 text-sm text-black placeholder-gray-500 focus:outline-none focus:border-[#1b4332] transition-colors disabled:opacity-50"
                />

                <button
                  type="submit"
                  disabled={isExtracting}
                  className="w-full bg-[#1b4332] hover:bg-[#2d6a4f] text-white font-bold py-3 px-4 rounded-sm border border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isExtracting ? (
                    <>
                      <RefreshCw className="h-5 w-5 animate-spin" />
                      Parsing Resume Skills...
                    </>
                  ) : (
                    <>
                      <Zap className="h-5 w-5" />
                      Extract Resume Skills
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Extracted Skills confirmation & Gap Analysis triggers */}
            <div className="flex flex-col gap-6">
              
              {/* Confirmed Skills Panel */}
              <div className="glass-panel p-6 rounded-sm flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-md font-bold text-gray-800">Skills and Experience Profile</h3>
                  {experienceLevel && (
                    <span className="bg-[#1b4332] text-white text-[10px] px-2.5 py-1 rounded-sm border border-black font-bold uppercase">
                      {experienceLevel}
                    </span>
                  )}
                </div>

                {extractedSkills.length === 0 ? (
                  <div className="border border-black/10 bg-[#f7f6f3]/60 rounded-sm p-8 text-center text-gray-600 text-sm">
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
                        className="flex-1 bg-white border border-black rounded-sm py-1.5 px-3 text-xs text-black placeholder-gray-500 focus:outline-none focus:border-[#1b4332]"
                      />
                      <button
                        onClick={addSkill}
                        className="bg-white hover:bg-black/5 border border-black rounded-sm px-3 py-1.5 text-black"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Skill chips */}
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                      {extractedSkills.map((skill, idx) => (
                        <div
                          key={`${skill}-${idx}`}
                          className="bg-[#f0ede9] hover:bg-[#eae6e1] border border-black/20 text-black text-xs py-1 px-2.5 rounded-sm flex items-center gap-1.5 transition-colors"
                        >
                          {skill}
                          <button
                            onClick={() => removeSkill(idx)}
                            className="hover:text-red-600 text-gray-500"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Extracted Projects */}
                    {extractedProjects.length > 0 && (
                      <div className="pt-2 border-t border-black/10">
                        <div className="text-xs text-gray-500 font-bold mb-2">Identified Projects:</div>
                        <ul className="list-disc pl-4 text-xs text-gray-700 space-y-1">
                          {extractedProjects.map((proj, idx) => (
                            <li key={idx}>{proj}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Gap analysis button */}
                    <div className="pt-2">
                      <button
                        onClick={runGapAnalysis}
                        disabled={isAnalyzing}
                        className="w-full bg-[#1b4332] hover:bg-[#2d6a4f] text-white font-bold py-2.5 px-4 rounded-sm border border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all flex items-center justify-center gap-2"
                      >
                        {isAnalyzing ? (
                          <>
                            <RefreshCw className="h-5 w-5 animate-spin" />
                            Analyzing Gap Against {selectedRole === 'Other (custom)' ? customRoleInput || 'Custom Role' : selectedRole}...
                          </>
                        ) : (
                          <>
                            <TrendingUp className="h-5 w-5" />
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
                <div className="glass-panel p-6 rounded-sm flex flex-col gap-5 border-2 border-black">
                  <div className="flex justify-between items-center border-b border-black pb-3">
                    <div className="flex items-center gap-2">
                      <Award className="h-5 w-5 text-[#1b4332]" />
                      <h3 className="text-md font-bold text-gray-900">
                        Analysis vs {selectedRole === 'Other (custom)' ? customRoleInput || 'Custom Role' : selectedRole}
                      </h3>
                      {selectedRole === 'Other (custom)' && (
                        <span className="ml-2 text-[9px] bg-amber-100 text-amber-800 border border-amber-300 font-bold uppercase px-1.5 py-0.5 rounded-sm">
                          ⚠️ AI-Inferred Estimate
                        </span>
                      )}
                    </div>
                    {/* Score badge */}
                    <div className="flex flex-col items-end">
                      <span className="text-2xl font-black text-[#1b4332] leading-none">
                        {gapResults.match_percentage}%
                      </span>
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wide mt-1">Match Index</span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-[#f0ede9] border border-black rounded-sm h-3 overflow-hidden">
                    <div
                      className="bg-[#1b4332] h-full rounded-none transition-all duration-1000 ease-out"
                      style={{ width: `${gapResults.match_percentage}%` }}
                    />
                  </div>

                  {/* Curated Skill Chips */}
                  <div className="space-y-4">
                    
                    {/* Matched */}
                    <div>
                      <div className="text-xs text-[#1b4332] font-bold flex items-center gap-1.5 mb-1.5">
                        <CheckCircle className="h-3.5 w-3.5" /> Matched Skills ({gapResults.matched.length})
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {gapResults.matched.map((sk) => (
                          <span key={sk} className="bg-[#d8f3dc] border border-[#1b4332]/30 text-[#1b4332] text-[10px] py-0.5 px-2 rounded-sm font-medium">
                            {sk}
                          </span>
                        ))}
                        {gapResults.matched.length === 0 && (
                          <span className="text-xs text-gray-500">None identified</span>
                        )}
                      </div>
                    </div>

                    {/* Partial */}
                    <div>
                      <div className="text-xs text-[#b87d2b] font-bold flex items-center gap-1.5 mb-1.5">
                        <HelpCircle className="h-3.5 w-3.5" /> Partial Skills ({gapResults.partial.length})
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {gapResults.partial.map((sk) => (
                          <span key={sk} className="bg-[#fef9c3] border border-[#b87d2b]/30 text-[#854d0e] text-[10px] py-0.5 px-2 rounded-sm font-medium">
                            {sk}
                          </span>
                        ))}
                        {gapResults.partial.length === 0 && (
                          <span className="text-xs text-gray-500">None identified</span>
                        )}
                      </div>
                    </div>

                    {/* Missing */}
                    <div>
                      <div className="text-xs text-[#991b1b] font-bold flex items-center gap-1.5 mb-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" /> Missing Skills ({gapResults.missing.length})
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {gapResults.missing.map((sk) => (
                          <span key={sk} className="bg-[#ffeeeb] border border-[#991b1b]/30 text-[#991b1b] text-[10px] py-0.5 px-2 rounded-sm font-medium">
                            {sk}
                          </span>
                        ))}
                        {gapResults.missing.length === 0 && (
                          <span className="text-xs text-gray-500">None identified</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="bg-[#f0ede9] p-4 rounded-sm border border-black">
                    <div className="text-xs text-gray-600 font-bold mb-1.5">Evaluation Summary:</div>
                    <p className="text-xs text-gray-800 leading-relaxed font-normal">{gapResults.summary}</p>
                  </div>

                  {/* Collapsible Reasoning Section */}
                  {gapResults.reasoning && Object.keys(gapResults.reasoning).length > 0 && (
                    <div className="bg-white border border-black rounded-sm overflow-hidden">
                      <button
                        onClick={() => setShowReasoning(!showReasoning)}
                        className="w-full text-left px-4 py-3 flex items-center justify-between text-xs font-bold text-gray-800 hover:bg-black/5 transition-colors"
                      >
                        <span className="flex items-center gap-1.5">
                          <HelpCircle className="h-4 w-4 text-[#1b4332]" />
                          Why this result? (Skill-by-Skill Breakdown)
                        </span>
                        <span>{showReasoning ? '▲' : '▼'}</span>
                      </button>
                      
                      {showReasoning && (
                        <div className="px-4 pb-4 pt-1 space-y-2.5 border-t border-black/10 bg-[#f7f6f3]/30 max-h-60 overflow-y-auto">
                          {Object.entries(gapResults.reasoning).map(([skill, reason]) => {
                            const isMatched = gapResults.matched.some(s => s.toLowerCase() === skill.toLowerCase());
                            const isPartial = gapResults.partial.some(s => s.toLowerCase() === skill.toLowerCase());
                            
                            let badgeColor = "bg-[#ffeeeb] border-[#991b1b]/30 text-[#991b1b]";
                            let category = "Missing";
                            
                            if (isMatched) {
                              badgeColor = "bg-[#d8f3dc] border-[#1b4332]/30 text-[#1b4332]";
                              category = "Matched";
                            } else if (isPartial) {
                              badgeColor = "bg-[#fef9c3] border-[#b87d2b]/30 text-[#854d0e]";
                              category = "Partial";
                            }
                            
                            return (
                              <div key={skill} className="text-xs border-b border-black/5 pb-2 last:border-b-0 last:pb-0 pt-1">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <span className="font-bold text-gray-800">{skill}</span>
                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${badgeColor}`}>
                                    {category}
                                  </span>
                                </div>
                                <p className="text-gray-600 leading-relaxed font-normal text-[11px]">{reason}</p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Roadmap Action Button */}
                  <div className="pt-1">
                    <button
                      onClick={runLearningPath}
                      disabled={isGeneratingPath || (gapResults.missing.length === 0 && gapResults.partial.length === 0)}
                      className="w-full bg-[#1b4332] hover:bg-[#2d6a4f] text-white font-bold py-2.5 px-4 rounded-sm border border-black shadow-[2px_2px_0px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_0px_#000] transition-all flex items-center justify-center gap-2"
                    >
                      {isGeneratingPath ? (
                        <>
                          <RefreshCw className="h-5 w-5 animate-spin" />
                          Curating Course Path...
                        </>
                      ) : (
                        <>
                          <BookOpen className="h-5 w-5" />
                          Generate Personalized Learning Path
                          <ArrowRight className="h-4 w-4" />
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
          <div className="glass-panel p-6 md:p-8 rounded-sm flex flex-col gap-6 max-w-4xl mx-auto w-full">
            <div className="flex justify-between items-center border-b border-black pb-4">
              <div className="flex items-center gap-3">
                <Map className="h-6 w-6 text-[#1b4332]" />
                <div>
                  <h2 className="text-lg font-bold text-gray-905">Personalized Learning Roadmap</h2>
                  <p className="text-xs text-gray-500">Target Role: {selectedRole === 'Other (custom)' ? customRoleInput || 'Custom Role' : selectedRole}</p>
                </div>
              </div>
              
              <button 
                onClick={runLearningPath}
                disabled={isGeneratingPath}
                className="text-xs bg-white border border-black rounded-sm px-3 py-1.5 flex items-center gap-1.5 text-black hover:bg-black/5 font-semibold"
              >
                <RefreshCw className={`h-3 w-3 ${isGeneratingPath ? 'animate-spin' : ''}`} />
                Regenerate Path
              </button>
            </div>

            {learningPath ? (
              learningPath.length > 0 ? (
                <div className="relative pl-6 md:pl-8 border-l border-black/35 space-y-8 my-4">
                  {learningPath.map((step, idx) => (
                    <div key={idx} className="relative">
                      {/* Node Dot */}
                      <span className="absolute -left-[35px] md:-left-[43px] top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white border-2 border-black text-xs font-black text-[#1b4332] shadow-md shadow-[#1b4332]/10">
                        {idx + 1}
                      </span>
                      
                      {/* Roadmap step card */}
                      <div className="bg-white border border-black p-5 rounded-sm hover:border-[#1b4332] hover:shadow-[3px_3px_0px_0px_#1b4332] transition-all">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
                          <h4 className="text-md font-extrabold text-[#1b4332]">{step.skill}</h4>
                          <span className="bg-[#1b4332]/10 text-[#1b4332] text-[10px] py-1 px-2.5 rounded-sm font-bold flex-shrink-0 self-start md:self-auto border border-[#1b4332]/20">
                            ⏳ Est. Time: {step.learning_time}
                          </span>
                        </div>
                        
                        <p className="text-xs text-gray-700 mb-4 leading-relaxed font-normal">
                          {step.why_it_matters}
                        </p>
                        
                        {/* Resources */}
                        <div>
                          <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">Recommended Study Resources:</div>
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
                                  className="bg-white border border-black hover:bg-[#1b4332] hover:text-white hover:border-black transition-colors text-xs py-1.5 px-3 rounded-sm flex items-center gap-2 cursor-pointer group"
                                >
                                  <BookOpen className="h-3.5 w-3.5 text-[#1b4332] group-hover:text-white" />
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
                <div className="bg-[#d8f3dc] border border-[#1b4332] p-8 rounded-sm text-center max-w-xl mx-auto my-6">
                  <span className="inline-block bg-[#1b4332]/10 p-4 rounded-sm text-[#1b4332] border border-[#1b4332]/25 mb-4 font-bold text-2xl">🎉</span>
                  <h4 className="text-lg font-bold text-black mb-2">Perfect Fit!</h4>
                  <p className="text-sm text-gray-850">
                    Your skills are a perfect match for the selected role. No skill gaps detected, so you do not need a custom learning path roadmap. You are fully ready for this role!
                  </p>
                </div>
              )
            ) : (
              <div className="text-center py-12 text-gray-500 text-sm border border-dashed border-black/30 rounded-sm">
                No learning path generated. Click the generate button on your Gap Analysis report under "Upload & Analyze" tab to build your path.
              </div>
            )}
          </div>
        )}

        {/* TAB 3: MOCK INTERVIEW */}
        {activeTab === 'interview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start max-w-6xl mx-auto w-full">
            
            {/* Left sidebar layout containing status and feedback */}
            <div className="lg:col-span-1 flex flex-col gap-6">
              
              {/* Interview Controller Card */}
              <div className="glass-panel p-6 rounded-sm flex flex-col gap-4">
                <h3 className="text-md font-bold text-gray-900">Interview Controller</h3>
                <p className="text-xs text-gray-600">
                  Conduct a standard 5-question interview tailored to the <span className="font-semibold text-[#1b4332]">{selectedRole === 'Other (custom)' ? customRoleInput || 'Custom Role' : selectedRole}</span> role. Answer questions fully. At the end, you'll receive a mock scorecard detailing strengths and advice.
                </p>
                
                <button
                  onClick={startInterview}
                  disabled={isInterviewing}
                  className="w-full bg-[#1b4332] hover:bg-[#2d6a4f] text-white font-bold py-2.5 px-4 rounded-sm border border-black shadow-[2px_2px_0px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_0px_#000] transition-all flex items-center justify-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  {interviewStarted ? "Restart Interview" : "Start Mock Interview"}
                </button>
              </div>

              {/* Turn-by-Turn Immediate Feedback */}
              {lastFeedback && !isInterviewFinished && (
                <div className="bg-[#f0ede9] border border-black p-5 rounded-sm flex flex-col gap-2.5">
                  <div className="flex items-center gap-2 text-[#1b4332] text-xs font-bold uppercase tracking-wider">
                    <Zap className="h-4 w-4" /> Last Response Feedback
                  </div>
                  <p className="text-xs text-gray-800 leading-relaxed font-normal">
                    "{lastFeedback}"
                  </p>
                </div>
              )}
            </div>

            {/* Chat Box Interface */}
            <div className="lg:col-span-2 glass-panel rounded-sm flex flex-col h-[560px] overflow-hidden">
              
              {/* Chat Header */}
              <div className="bg-[#f0ede9] px-6 py-4 border-b border-black flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-[#1b4332]" />
                  <span className="text-sm font-bold text-gray-900">Live Mock Session</span>
                </div>
                {interviewStarted && (
                  <span className="bg-white border border-black text-[#1b4332] text-[10px] px-2.5 py-1 rounded-sm font-bold uppercase">
                    Stateless Session
                  </span>
                )}
              </div>

              {/* Chat Messages Log */}
              <div className="flex-1 p-6 overflow-y-auto space-y-4">
                {!interviewStarted ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-gray-600 text-sm gap-3">
                    <div className="bg-black/5 p-4 rounded-sm text-black border border-black/10">
                      <MessageSquare className="h-8 w-8" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">Interview Session Ready</p>
                      <p className="text-xs text-gray-500 max-w-xs mt-1">
                        Click "Start Mock Interview" in the panel to begin.
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
                          <div className={`h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                            isAssistant ? 'bg-[#1b4332] text-white border border-black' : 'bg-[#eae6e1] text-black border border-black/30'
                          }`}>
                            {isAssistant ? "AI" : <User className="h-4 w-4" />}
                          </div>
                          
                          {/* Text bubble */}
                          <div className={`p-4 rounded-sm text-xs leading-relaxed ${
                            isAssistant 
                              ? 'bg-white text-black rounded-tl-none border-2 border-black shadow-[2px_2px_0px_0px_#000]' 
                              : 'bg-[#1b4332] text-white rounded-tr-none border border-black shadow-[2px_2px_0px_0px_#000]'
                          }`}>
                            <p className="whitespace-pre-line font-medium">{msg.content}</p>
                          </div>
                        </div>
                      );
                    })}

                    {/* Premium Styled Scorecard Component */}
                    {isInterviewFinished && scorecard && (
                      <div className="bg-[#d8f3dc] border border-[#1b4332] rounded-sm p-6 mt-4 space-y-4 shadow-[2px_2px_0px_0px_#1b4332]">
                        <div className="flex items-center gap-2 border-b border-[#1b4332]/35 pb-3">
                          <Award className="h-6 w-6 text-[#1b4332]" />
                          <h4 className="text-sm font-extrabold text-[#1b4332]">Mock Interview Scorecard</h4>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Strengths */}
                          <div className="bg-[#d8f3dc]/30 border border-[#1b4332] p-4 rounded-sm">
                            <div className="text-xs font-bold text-[#1b4332] mb-2 uppercase tracking-wide">Key Strengths:</div>
                            <ul className="list-disc pl-4 text-[11px] text-gray-800 space-y-1.5 leading-relaxed font-normal">
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
                          <div className="bg-[#ffeeeb]/30 border border-[#991b1b] p-4 rounded-sm">
                            <div className="text-xs font-bold text-[#991b1b] mb-2 uppercase tracking-wide">Areas to Improve:</div>
                            <ul className="list-disc pl-4 text-[11px] text-gray-800 space-y-1.5 leading-relaxed font-normal">
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
                        <div className="bg-[#f0ede9] border border-black p-4 rounded-sm">
                          <div className="text-xs font-bold text-[#1b4332] mb-2 flex items-center gap-1.5 uppercase tracking-wide">
                            <Zap className="h-3.5 w-3.5 text-[#1b4332]" /> Actionable Advice:
                          </div>
                          <p className="text-[11px] text-gray-850 leading-relaxed font-medium">
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
                <div className="bg-[#f0ede9] border-t border-black p-4">
                  {isInterviewFinished ? (
                    <div className="bg-[#d8f3dc] border border-[#1b4332] rounded-sm p-3.5 text-center text-[#1b4332] text-xs font-semibold">
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
      <footer className="py-6 text-center text-xs text-gray-700 border-t border-black mt-12 bg-white">
        SkillBridge MVP — Building Decent Work and Economic Growth (SDG 8)
      </footer>
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
        className="flex-1 bg-white border border-black rounded-sm py-2 px-4 text-xs text-black placeholder-gray-500 focus:outline-none focus:border-[#1b4332] resize-none disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={isSubmittingAnswer || !inputValue.trim()}
        className="bg-[#1b4332] hover:bg-[#2d6a4f] text-white border border-black rounded-sm px-4 flex items-center justify-center flex-shrink-0 disabled:opacity-50 transition-colors"
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
