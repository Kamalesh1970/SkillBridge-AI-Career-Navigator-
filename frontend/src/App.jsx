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
  const [isLoadingRoles, setIsLoadingRoles] = useState(false);
  
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
  const [answerInput, setAnswerInput] = useState('');
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
      const res = await fetch(`${API_BASE}/roles`);
      if (!res.ok) throw new Error("Could not retrieve job roles list.");
      const data = await res.json();
      setRolesList(data);
      if (data.length > 0) setSelectedRole(data[0]);
    } catch (err) {
      console.error(err);
      setErrorMessage("Backend is offline or unreachable. Ensure the FastAPI server is running on port 8000.");
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
        res = await fetch(`${API_BASE}/analyze/extract-skills`, {
          method: "POST",
          body: formData,
        });
      } else {
        const formData = new FormData();
        formData.append("resume_text", resumeText);
        res = await fetch(`${API_BASE}/analyze/extract-skills`, {
          method: "POST",
          body: formData,
        });
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
      setErrorMessage(err.message || "Skill extraction failed.");
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
      const res = await fetch(`${API_BASE}/analyze/gap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skills: extractedSkills,
          target_role: selectedRole
        })
      });
      
      if (!res.ok) {
        const errDetail = await res.json();
        throw new Error(errDetail.detail || "Failed to analyze skills gap.");
      }
      
      const data = await res.json();
      setGapResults(data);
    } catch (err) {
      console.error(err);
      setErrorMessage(err.message || "Skill-Gap Analysis failed.");
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
      const res = await fetch(`${API_BASE}/learning-path`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missing_skills: gapResults.missing,
          partial_skills: gapResults.partial,
          target_role: selectedRole
        })
      });
      
      if (!res.ok) {
        const errDetail = await res.json();
        throw new Error(errDetail.detail || "Failed to generate learning path.");
      }
      
      const data = await res.json();
      setLearningPath(data.roadmap);
      setActiveTab('learning'); // Auto switch to roadmap tab
    } catch (err) {
      console.error(err);
      setErrorMessage(err.message || "Learning Path generation failed.");
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
      const res = await fetch(`${API_BASE}/interview/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_role: selectedRole,
          history: []
        })
      });
      
      if (!res.ok) throw new Error("Could not start mock interview.");
      const data = await res.json();
      
      setInterviewHistory([{ role: 'assistant', content: data.next_message }]);
      setInterviewStarted(true);
    } catch (err) {
      console.error(err);
      setErrorMessage(err.message);
      setIsInterviewing(false);
    }
  };

  // Submit Answer Turn
  const submitAnswer = async (e) => {
    e.preventDefault();
    if (!answerInput.trim() || isSubmittingAnswer) return;
    
    const userMsg = answerInput.trim();
    setAnswerInput('');
    setIsSubmittingAnswer(true);
    setErrorMessage('');
    
    // Optimistic append user message
    const updatedHistory = [...interviewHistory, { role: 'user', content: userMsg }];
    setInterviewHistory(updatedHistory);
    
    try {
      const res = await fetch(`${API_BASE}/interview/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_role: selectedRole,
          history: updatedHistory
        })
      });
      
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
      setErrorMessage("Error submitting answer: " + err.message);
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Hero Header Banner */}
      <header className="glass-panel sticky top-0 z-40 border-b border-white/5 py-4 px-6 md:px-12 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-brand-600 p-2.5 rounded-xl shadow-lg shadow-brand-500/20 border border-brand-400/20">
            <GraduationCapIcon className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold tracking-tight shimmer-text">
              SkillBridge
            </h1>
            <p className="text-xs text-gray-400 font-medium tracking-wide">
              AI CAREER NAVIGATOR FOR TIER-2/3 COLLEGE STUDENTS
            </p>
          </div>
        </div>
        
        {/* Core Global Status / Select Role */}
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="flex flex-col w-full md:w-56">
            <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">
              Select Target Job Role
            </label>
            <select
              value={selectedRole}
              onChange={(e) => {
                setSelectedRole(e.target.value);
                setGapResults(null);
                setLearningPath(null);
              }}
              disabled={isLoadingRoles}
              className="bg-gray-900 border border-white/10 rounded-lg py-1.5 px-3 text-sm text-gray-200 focus:outline-none focus:border-brand-500 transition-colors"
            >
              {rolesList.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 grid grid-cols-1 gap-6">
        
        {/* Error Modal/Banner */}
        {errorMessage && (
          <div className="bg-red-950/40 border border-red-500/30 rounded-xl p-4 flex items-start gap-3 text-red-200 text-sm animate-pulse">
            <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold text-red-300">System Notification:</span> {errorMessage}
            </div>
            <button onClick={() => setErrorMessage('')} className="hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Tab Navigation Bars */}
        <div className="flex flex-wrap border-b border-white/5 gap-1.5">
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex items-center gap-2 py-3 px-6 text-sm font-semibold rounded-t-xl transition-all border-b-2 ${
              activeTab === 'upload'
                ? 'border-brand-500 text-brand-400 bg-brand-500/5'
                : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'
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
            className={`flex items-center gap-2 py-3 px-6 text-sm font-semibold rounded-t-xl transition-all border-b-2 ${
              !gapResults ? 'opacity-50 cursor-not-allowed' : ''
            } ${
              activeTab === 'learning'
                ? 'border-brand-500 text-brand-400 bg-brand-500/5'
                : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Map className="h-4 w-4" />
            2. Learning Path
          </button>
          
          <button
            onClick={() => setActiveTab('interview')}
            className={`flex items-center gap-2 py-3 px-6 text-sm font-semibold rounded-t-xl transition-all border-b-2 ${
              activeTab === 'interview'
                ? 'border-brand-500 text-brand-400 bg-brand-500/5'
                : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'
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
            <div className="glass-panel p-6 rounded-2xl flex flex-col gap-5">
              <div className="flex items-center gap-2.5">
                <FileText className="h-5 w-5 text-brand-400" />
                <h2 className="text-lg font-bold text-gray-100">Resume / Skills Ingestion</h2>
              </div>
              <p className="text-sm text-gray-400">
                Upload your resume in PDF/TXT format or paste the plaintext contents below. Our AI will pull and parse your skills dynamically.
              </p>
              
              <form onSubmit={handleIngestion} className="space-y-4">
                {/* File Upload Box */}
                <div className="border-2 border-dashed border-white/10 hover:border-brand-500/50 rounded-xl p-6 transition-all bg-gray-900/50 hover:bg-gray-900/80 group">
                  <input
                    type="file"
                    id="file-upload"
                    accept=".pdf,.txt"
                    onChange={(e) => setUploadFile(e.target.files[0])}
                    className="hidden"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-2">
                    <div className="bg-brand-500/10 p-3 rounded-full text-brand-400 group-hover:scale-110 transition-transform">
                      <Upload className="h-6 w-6" />
                    </div>
                    {uploadFile ? (
                      <span className="text-sm text-brand-300 font-semibold">{uploadFile.name}</span>
                    ) : (
                      <>
                        <span className="text-sm font-semibold text-gray-200">Drag & drop or browse</span>
                        <span className="text-xs text-gray-500">Supports PDF, TXT</span>
                      </>
                    )}
                  </label>
                </div>

                <div className="text-center text-xs text-gray-500 font-semibold">— OR PASTE RESUME —</div>

                {/* Paste Area */}
                <textarea
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  placeholder="Paste details of your projects, skills, education, and work experience..."
                  rows={6}
                  disabled={!!uploadFile}
                  className="w-full bg-gray-900 border border-white/10 rounded-xl p-4 text-sm text-gray-300 placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors disabled:opacity-50"
                />

                <button
                  type="submit"
                  disabled={isExtracting}
                  className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 px-4 rounded-xl shadow-lg shadow-brand-500/10 hover:shadow-brand-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
              <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-md font-bold text-gray-200">Skills and Experience Profile</h3>
                  {experienceLevel && (
                    <span className="bg-brand-500/10 text-brand-300 border border-brand-500/20 text-xs px-2.5 py-1 rounded-full font-bold">
                      {experienceLevel}
                    </span>
                  )}
                </div>

                {extractedSkills.length === 0 ? (
                  <div className="border border-white/5 bg-gray-950/20 rounded-xl p-8 text-center text-gray-500 text-sm">
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
                        className="flex-1 bg-gray-950 border border-white/5 rounded-lg py-1.5 px-3 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-brand-500"
                      />
                      <button
                        onClick={addSkill}
                        className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 text-gray-300 hover:text-white"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Skill chips */}
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                      {extractedSkills.map((skill, idx) => (
                        <div
                          key={`${skill}-${idx}`}
                          className="bg-gray-800 hover:bg-gray-700 border border-white/5 text-gray-300 text-xs py-1 px-2.5 rounded-lg flex items-center gap-1.5 transition-colors"
                        >
                          {skill}
                          <button
                            onClick={() => removeSkill(idx)}
                            className="hover:text-red-400 text-gray-500"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Extracted Projects */}
                    {extractedProjects.length > 0 && (
                      <div className="pt-2 border-t border-white/5">
                        <div className="text-xs text-gray-400 font-bold mb-2">Identified Projects:</div>
                        <ul className="list-disc pl-4 text-xs text-gray-300 space-y-1">
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
                        className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-emerald-500/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                      >
                        {isAnalyzing ? (
                          <>
                            <RefreshCw className="h-5 w-5 animate-spin" />
                            Analyzing Gap Against {selectedRole}...
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
                <div className="glass-panel p-6 rounded-2xl flex flex-col gap-5 border border-emerald-500/15">
                  <div className="flex justify-between items-center border-b border-white/5 pb-3">
                    <div className="flex items-center gap-2">
                      <Award className="h-5 w-5 text-emerald-400" />
                      <h3 className="text-md font-bold text-gray-200">Analysis vs {selectedRole}</h3>
                    </div>
                    {/* Score badge */}
                    <div className="flex flex-col items-end">
                      <span className="text-2xl font-black text-emerald-400 leading-none">
                        {gapResults.match_percentage}%
                      </span>
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wide mt-1">Match Index</span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-gray-950 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full rounded-full transition-all duration-1000 ease-out"
                      style={{ width: `${gapResults.match_percentage}%` }}
                    />
                  </div>

                  {/* Curated Skill Chips */}
                  <div className="space-y-4">
                    
                    {/* Matched */}
                    <div>
                      <div className="text-xs text-emerald-400 font-bold flex items-center gap-1.5 mb-1.5">
                        <CheckCircle className="h-3.5 w-3.5" /> Matched Skills ({gapResults.matched.length})
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {gapResults.matched.map((sk) => (
                          <span key={sk} className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px] py-0.5 px-2 rounded-md font-medium">
                            {sk}
                          </span>
                        ))}
                        {gapResults.matched.length === 0 && (
                          <span className="text-xs text-gray-600">None identified</span>
                        )}
                      </div>
                    </div>

                    {/* Partial */}
                    <div>
                      <div className="text-xs text-yellow-500 font-bold flex items-center gap-1.5 mb-1.5">
                        <HelpCircle className="h-3.5 w-3.5" /> Partial Skills ({gapResults.partial.length})
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {gapResults.partial.map((sk) => (
                          <span key={sk} className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-[10px] py-0.5 px-2 rounded-md font-medium">
                            {sk}
                          </span>
                        ))}
                        {gapResults.partial.length === 0 && (
                          <span className="text-xs text-gray-600">None identified</span>
                        )}
                      </div>
                    </div>

                    {/* Missing */}
                    <div>
                      <div className="text-xs text-red-500 font-bold flex items-center gap-1.5 mb-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" /> Missing Skills ({gapResults.missing.length})
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {gapResults.missing.map((sk) => (
                          <span key={sk} className="bg-red-500/10 border border-red-500/20 text-red-300 text-[10px] py-0.5 px-2 rounded-md font-medium">
                            {sk}
                          </span>
                        ))}
                        {gapResults.missing.length === 0 && (
                          <span className="text-xs text-gray-600">None identified</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="bg-gray-900/50 p-4 rounded-xl border border-white/5">
                    <div className="text-xs text-gray-400 font-bold mb-1.5">Evaluation Summary:</div>
                    <p className="text-xs text-gray-300 leading-relaxed font-normal">{gapResults.summary}</p>
                  </div>

                  {/* Collapsible Reasoning Section */}
                  {gapResults.reasoning && Object.keys(gapResults.reasoning).length > 0 && (
                    <div className="bg-gray-900/30 border border-white/5 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setShowReasoning(!showReasoning)}
                        className="w-full text-left px-4 py-3 flex items-center justify-between text-xs font-bold text-gray-300 hover:bg-gray-800/40 transition-colors"
                      >
                        <span className="flex items-center gap-1.5">
                          <HelpCircle className="h-4 w-4 text-emerald-400" />
                          Why this result? (Skill-by-Skill Breakdown)
                        </span>
                        <span>{showReasoning ? '▲' : '▼'}</span>
                      </button>
                      
                      {showReasoning && (
                        <div className="px-4 pb-4 pt-1 space-y-2.5 border-t border-white/5 bg-gray-950/20 max-h-60 overflow-y-auto">
                          {Object.entries(gapResults.reasoning).map(([skill, reason]) => {
                            const isMatched = gapResults.matched.some(s => s.toLowerCase() === skill.toLowerCase());
                            const isPartial = gapResults.partial.some(s => s.toLowerCase() === skill.toLowerCase());
                            
                            let badgeColor = "bg-red-500/10 border-red-500/20 text-red-400";
                            let category = "Missing";
                            
                            if (isMatched) {
                              badgeColor = "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
                              category = "Matched";
                            } else if (isPartial) {
                              badgeColor = "bg-yellow-500/10 border-yellow-500/20 text-yellow-400";
                              category = "Partial";
                            }
                            
                            return (
                              <div key={skill} className="text-xs border-b border-white/5 pb-2 last:border-b-0 last:pb-0 pt-1">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <span className="font-bold text-gray-200">{skill}</span>
                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${badgeColor}`}>
                                    {category}
                                  </span>
                                </div>
                                <p className="text-gray-400 leading-relaxed font-normal text-[11px]">{reason}</p>
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
                      className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-brand-500/10 hover:shadow-brand-500/20 transition-all"
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
          <div className="glass-panel p-6 md:p-8 rounded-2xl flex flex-col gap-6 max-w-4xl mx-auto w-full">
            <div className="flex justify-between items-center border-b border-white/5 pb-4">
              <div className="flex items-center gap-3">
                <Map className="h-6 w-6 text-brand-400" />
                <div>
                  <h2 className="text-lg font-bold text-gray-100">Personalized Learning Roadmap</h2>
                  <p className="text-xs text-gray-400">Target Role: {selectedRole}</p>
                </div>
              </div>
              
              <button 
                onClick={runLearningPath}
                disabled={isGeneratingPath}
                className="text-xs bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 flex items-center gap-1.5 text-gray-300 hover:text-white"
              >
                <RefreshCw className={`h-3 w-3 ${isGeneratingPath ? 'animate-spin' : ''}`} />
                Regenerate Path
              </button>
            </div>

            {learningPath ? (
              <div className="relative pl-6 md:pl-8 border-l border-brand-500/30 space-y-8 my-4">
                {learningPath.map((step, idx) => (
                  <div key={idx} className="relative">
                    {/* Node Dot */}
                    <span className="absolute -left-[35px] md:-left-[43px] top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-gray-950 border-2 border-brand-500 text-xs font-black text-brand-400 shadow-md shadow-brand-500/10">
                      {idx + 1}
                    </span>
                    
                    {/* Roadmap step card */}
                    <div className="bg-gray-900/60 border border-white/5 p-5 rounded-xl hover:border-brand-500/20 transition-all">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
                        <h4 className="text-md font-bold text-brand-300">{step.skill}</h4>
                        <span className="bg-brand-500/10 text-brand-300 text-[10px] py-1 px-2.5 rounded-full font-bold flex-shrink-0 self-start md:self-auto border border-brand-500/15">
                          ⏳ Est. Time: {step.learning_time}
                        </span>
                      </div>
                      
                      <p className="text-xs text-gray-300 mb-4 leading-relaxed font-normal">
                        {step.why_it_matters}
                      </p>
                      
                      {/* Resources */}
                      <div>
                        <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2">Recommended Study Resources:</div>
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
                                className="bg-gray-950 border border-white/10 hover:border-brand-500/30 text-gray-300 hover:text-white hover:bg-gray-900 transition-colors text-xs py-1.5 px-3 rounded-lg flex items-center gap-2 cursor-pointer"
                              >
                                <BookOpen className="h-3.5 w-3.5 text-brand-400" />
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
              <div className="text-center py-12 text-gray-500 text-sm">
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
              <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4">
                <h3 className="text-md font-bold text-gray-200">Interview Controller</h3>
                <p className="text-xs text-gray-400">
                  Conduct a standard 5-question interview tailored to the <span className="font-semibold text-brand-400">{selectedRole}</span> role. Answer questions fully. At the end, you'll receive a mock scorecard detailing strengths and advice.
                </p>
                
                <button
                  onClick={startInterview}
                  disabled={isInterviewing}
                  className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-brand-500/10 hover:shadow-brand-500/20 active:scale-[0.98] transition-all"
                >
                  <RefreshCw className="h-4 w-4" />
                  {interviewStarted ? "Restart Interview" : "Start Mock Interview"}
                </button>
              </div>

              {/* Turn-by-Turn Immediate Feedback */}
              {lastFeedback && !isInterviewFinished && (
                <div className="bg-brand-950/20 border border-brand-500/20 p-5 rounded-2xl flex flex-col gap-2.5">
                  <div className="flex items-center gap-2 text-brand-400 text-xs font-bold uppercase tracking-wider">
                    <Zap className="h-4 w-4" /> Last Response Feedback
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed font-normal">
                    "{lastFeedback}"
                  </p>
                </div>
              )}
            </div>

            {/* Chat Box Interface */}
            <div className="lg:col-span-2 glass-panel rounded-2xl flex flex-col h-[560px] overflow-hidden">
              
              {/* Chat Header */}
              <div className="bg-gray-900 px-6 py-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-brand-400" />
                  <span className="text-sm font-bold text-gray-200">Live Mock Session</span>
                </div>
                {interviewStarted && (
                  <span className="bg-gray-800 text-gray-400 text-[10px] px-2.5 py-1 rounded-full font-bold">
                    Stateless Session
                  </span>
                )}
              </div>

              {/* Chat Messages Log */}
              <div className="flex-1 p-6 overflow-y-auto space-y-4">
                {!interviewStarted ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 text-sm gap-3">
                    <div className="bg-white/5 p-4 rounded-full text-gray-400">
                      <MessageSquare className="h-8 w-8" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-300">Interview Session Ready</p>
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
                            isAssistant ? 'bg-brand-600 text-white' : 'bg-gray-700 text-gray-200'
                          }`}>
                            {isAssistant ? "AI" : <User className="h-4 w-4" />}
                          </div>
                          
                          {/* Text bubble */}
                          <div className={`p-4 rounded-2xl text-xs leading-relaxed ${
                            isAssistant 
                              ? 'bg-gray-900 text-gray-200 rounded-tl-none border border-white/5' 
                              : 'bg-brand-600 text-white rounded-tr-none shadow-md shadow-brand-500/10'
                          }`}>
                            <p className="whitespace-pre-line font-medium">{msg.content}</p>
                          </div>
                        </div>
                      );
                    })}

                    {/* Premium Styled Scorecard Component */}
                    {isInterviewFinished && scorecard && (
                      <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-2xl p-6 mt-4 space-y-4 shadow-xl">
                        <div className="flex items-center gap-2 border-b border-emerald-500/25 pb-3">
                          <Award className="h-6 w-6 text-emerald-400" />
                          <h4 className="text-sm font-extrabold text-emerald-400">Mock Interview Scorecard</h4>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Strengths */}
                          <div className="bg-emerald-900/10 border border-emerald-500/10 p-4 rounded-xl">
                            <div className="text-xs font-bold text-emerald-300 mb-2 uppercase tracking-wide">Key Strengths:</div>
                            <ul className="list-disc pl-4 text-[11px] text-gray-300 space-y-1.5 leading-relaxed font-normal">
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
                          <div className="bg-red-950/15 border border-red-500/10 p-4 rounded-xl">
                            <div className="text-xs font-bold text-red-300 mb-2 uppercase tracking-wide">Areas to Improve:</div>
                            <ul className="list-disc pl-4 text-[11px] text-gray-300 space-y-1.5 leading-relaxed font-normal">
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
                        <div className="bg-brand-950/20 border border-brand-500/15 p-4 rounded-xl">
                          <div className="text-xs font-bold text-brand-300 mb-2 flex items-center gap-1.5 uppercase tracking-wide">
                            <Zap className="h-3.5 w-3.5 text-brand-400" /> Actionable Advice:
                          </div>
                          <p className="text-[11px] text-gray-300 leading-relaxed font-medium">
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
                <div className="bg-gray-900 border-t border-white/5 p-4">
                  {isInterviewFinished ? (
                    <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-3.5 text-center text-emerald-300 text-xs font-semibold">
                      🎓 Interview successfully completed! You can review your detailed scorecard above.
                    </div>
                  ) : (
                    <form onSubmit={submitAnswer} className="flex gap-2">
                      <textarea
                        value={answerInput}
                        onChange={(e) => setAnswerInput(e.target.value)}
                        placeholder="Type your response here..."
                        rows={2}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            submitAnswer(e);
                          }
                        }}
                        disabled={isSubmittingAnswer}
                        className="flex-1 bg-gray-950 border border-white/10 rounded-xl py-2 px-4 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-brand-500 resize-none disabled:opacity-50"
                      />
                      <button
                        type="submit"
                        disabled={isSubmittingAnswer || !answerInput.trim()}
                        className="bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl px-4 flex items-center justify-center flex-shrink-0 disabled:opacity-50 transition-colors"
                      >
                        {isSubmittingAnswer ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer Info */}
      <footer className="py-6 text-center text-xs text-gray-600 border-t border-white/5 mt-12 bg-gray-950/20">
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
