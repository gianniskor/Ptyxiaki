"use client";

import React, { useState, useEffect } from 'react';
import {
  Search, User, Wallet, Command, X,
  Clock, FileText, Share, Plus,
  Scale, BookOpen, Landmark, Gavel, Shield,
  Sparkles, MessageSquare, Filter, ChevronDown
} from 'lucide-react';

// Η δομή των δεδομένων από το Backend μας
interface SearchResult {
  id: string;
  arithmos: string;
  dikastirio: string;
  etos: number;
  titlos: string;
  katigoria: string[];
  snippet?: string;
  pdf_path: string;
}

export default function App() {
  // UI States
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showChatbot, setShowChatbot] = useState(false);

  // Data States (Για την επικοινωνία με το API)
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activePdfUrl, setActivePdfUrl] = useState<string | null>(null);

  // Κλείσιμο με Escape και άνοιγμα με Cmd/Ctrl + K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
        setActivePdfUrl(null);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Η συνάρτηση που ρωτάει το FastAPI
  const handleSearch = async (searchQuery: string) => {
    setQuery(searchQuery);
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/api/search?q=${searchQuery}&rows=10`);
      const data = await res.json();
      setResults(data.results || []);
    } catch (error) {
      console.error("Σφάλμα αναζήτησης:", error);
    } finally {
      setLoading(false);
    }
  };

  // Όταν κάνει κλικ σε αποτέλεσμα
  const handleResultClick = (pdfPath: string, arithmos: string, katigoria: string[]) => {
    setIsSearchOpen(false);

    const primaryCategory = (katigoria && katigoria.length > 0) ? katigoria[0] : "Άγνωστο";

    const fullPdfUrl = `http://localhost:8000/pdf/${primaryCategory}/${pdfPath}`;
    setActivePdfUrl(`${fullPdfUrl}#search=${query}`);
  };

  return (
    <div className="min-h-screen bg-[#0d0d0f] text-white font-sans relative overflow-x-hidden selection:bg-yellow-500/30">

      {/* Background Gradients */}
      <div className="absolute top-[-10%] right-[-5%] w-[800px] h-[800px] bg-yellow-500/10 blur-[150px] rounded-full pointer-events-none" />
      <div className="absolute top-[20%] left-[-10%] w-[600px] h-[600px] bg-purple-500/10 blur-[150px] rounded-full pointer-events-none" />

      {/* --- NAVBAR --- */}
      {/* TODO: Have animations? and remove the blank space between the border and the selected items */}
      <nav className="flex items-center justify-between px-8 py-6 relative z-10 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <Scale className="w-8 h-8 text-white" />
          <span className="text-xl font-bold tracking-wider">NOMOLOGIA</span>
        </div>

        <div className="hidden md:flex bg-[#1a1a1c] border border-gray-800 rounded-full p-1 shadow-lg">
          <button className="px-5 py-2 rounded-full bg-white text-black text-sm font-medium">Αρχική</button>
          <button className="px-5 py-2 rounded-full text-gray-400 hover:text-white transition text-sm font-medium">Συλλογές</button>
          <button className="px-5 py-2 rounded-full text-gray-400 hover:text-white transition text-sm font-medium" onClick={() => setShowChatbot(true)}>AI Assistant</button>
          <button className="px-5 py-2 rounded-full text-gray-400 hover:text-white transition text-sm font-medium">Περί</button>
        </div>

        <div className="flex items-center gap-6">
          <button onClick={() => setIsSearchOpen(true)} className="text-gray-300 hover:text-white transition">
            <Search className="w-5 h-5" />
          </button>
          <button className="text-gray-300 hover:text-white transition">
            <User className="w-5 h-5" />
          </button>
        </div>
      </nav>

      {/* --- HERO SECTION --- */}
      <main className="relative z-10 flex flex-col items-center justify-center mt-20 px-4 max-w-7xl mx-auto text-center">
        <h1 className="text-5xl md:text-7xl font-black mb-4 tracking-tight"
          style={{ background: 'linear-gradient(to right, #a78bfa, #fcd34d, #f97316)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          ΑΝΑΖΗΤΗΣΗ, ΜΕΛΕΤΗ & ΑΝΑΛΥΣΗ
        </h1>
        <h2 className="text-xl md:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500 mb-8 style-outline">
          ΕΞΕΡΕΥΝΗΣΤΕ ΤΗΝ ΕΛΛΗΝΙΚΗ ΝΟΜΟΛΟΓΙΑ
        </h2>

        <div
          onClick={() => setIsSearchOpen(true)}
          className="group flex items-center bg-[#151518] border border-gray-700/50 hover:border-yellow-500/50 rounded-full px-6 py-4 cursor-pointer w-full max-w-lg shadow-[0_0_30px_rgba(0,0,0,0.5)] transition-all duration-300"
        >
          <Search className="w-5 h-5 mr-4 text-yellow-500/80 group-hover:text-yellow-400" />
          <span className="text-gray-400 group-hover:text-gray-200 transition-colors text-lg">
            Αναζήτηση αποφάσεων...
          </span>
          <div className="ml-auto flex items-center gap-1 bg-[#222] border border-gray-700 text-gray-400 text-xs px-3 py-1.5 rounded-full">
            <Command className="w-3 h-3" />
            <span>K</span>
          </div>
        </div>

        {/* --- CARDS --- */}
        {/* TODO: Have more creative and fun cards ( use nextjs or react components) */}
        <div className="flex flex-wrap justify-center gap-4 md:gap-6 mt-24 mb-16 w-full">
          {/* Card 1 */}
          <div className="w-40 h-56 md:w-48 md:h-64 rounded-3xl bg-[#E85D54] flex flex-col items-center justify-center p-6 transform hover:-translate-y-2 transition duration-300 shadow-xl overflow-hidden relative cursor-pointer" onClick={() => { setQuery("Αστικό"); setIsSearchOpen(true); }}>
            <Landmark className="w-16 h-16 text-white mb-4 drop-shadow-md" />
            <span className="text-white font-bold text-center leading-tight">Αστικό<br />Δίκαιο</span>
          </div>
          {/* Card 2 */}
          <div className="w-40 h-56 md:w-48 md:h-64 rounded-3xl bg-[#2A3F54] flex flex-col items-center justify-center p-6 transform translate-y-4 hover:translate-y-2 transition duration-300 shadow-xl relative overflow-hidden cursor-pointer">
            <Gavel className="w-16 h-16 text-white mb-4 drop-shadow-md" />
            <span className="text-white font-bold text-center leading-tight">Ποινικό<br />Δίκαιο</span>
          </div>
          {/* Card 3 */}
          <div className="w-40 h-56 md:w-48 md:h-64 rounded-3xl bg-[#F4D06F] flex flex-col items-center justify-center p-6 transform -translate-y-4 hover:-translate-y-6 transition duration-300 shadow-xl relative overflow-hidden cursor-pointer">
            <Shield className="w-16 h-16 text-gray-900 mb-4 drop-shadow-sm" />
            <span className="text-gray-900 font-bold text-center leading-tight">Διοικητικό<br />Δίκαιο</span>
          </div>
        </div>
      </main>

      {/* Floating LLM Chatbot Trigger */}
      <button
        onClick={() => setShowChatbot(!showChatbot)}
        className="fixed bottom-8 right-8 z-40 bg-gradient-to-r from-yellow-500 to-yellow-600 p-4 rounded-full shadow-lg hover:shadow-yellow-500/20 hover:scale-105 transition-all text-black"
      >
        <Sparkles className="w-6 h-6" />
      </button>


      {/* --- COMMAND-K SEARCH MODAL --- */}
      {/* FIXME: The Search Modal Must Have Filters to click on, and have recent searches and popular categories*/}
      {isSearchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 backdrop-blur-sm bg-black/40">
          <div className="absolute inset-0" onClick={() => setIsSearchOpen(false)}></div>

          <div className="relative w-full max-w-2xl bg-[#1e1e1e] border border-gray-800/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-gray-200" onClick={e => e.stopPropagation()}>

            {/* Input */}
            <div className="flex items-center px-4 py-4 border-b border-gray-800/60">
              <Search className="w-5 h-5 text-yellow-500/80 mr-3" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Αναζήτηση για αποφάσεις, δικαστήρια, θέματα..."
                className="flex-1 bg-transparent border-none outline-none text-lg text-white placeholder-gray-500"
              />
              <button className="ml-3 p-1.5 bg-[#2c2c2e] hover:bg-[#3c3c3e] rounded text-gray-400 transition-colors flex items-center gap-1">
                <Filter className="w-4 h-4" />
                <span className="text-xs">F</span>
              </button>
            </div>

            {/* Results Area */}
            <div className="p-4 overflow-y-auto max-h-[65vh] custom-scrollbar min-h-[300px]">

              {loading && (
                <div className="flex justify-center items-center py-10 text-gray-500">
                  <Sparkles className="w-5 h-5 animate-pulse mr-2" /> Αναζήτηση...
                </div>
              )}

              {/* Show Static UI if no search query */}
              {!query && !loading && (
                <>
                  <div className="mb-6">
                    <p className="text-xs text-gray-500 mb-3 px-2">I'm looking for...</p>
                    <div className="flex flex-wrap gap-2 px-2">
                      <button className="flex items-center gap-1.5 bg-[#2a2a2c] border border-gray-700/50 px-3 py-1.5 rounded-full text-sm">
                        <Scale className="w-3.5 h-3.5 text-gray-400" /> Κατηγορίες
                      </button>
                      <button className="flex items-center gap-1.5 bg-[#2a2a2c] border border-gray-700/50 px-3 py-1.5 rounded-full text-sm">
                        <Landmark className="w-3.5 h-3.5 text-gray-400" /> Δικαστήρια
                      </button>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 mb-2 px-2">Άμεσες ενέργειες</p>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-[#2a2a2c] cursor-pointer" onClick={() => { setIsSearchOpen(false); setShowChatbot(true); }}>
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded flex items-center justify-center bg-[#333]"><Sparkles className="w-4 h-4 text-yellow-500" /></div>
                          <span className="text-sm text-gray-300">Άνοιγμα AI Assistant</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* DYNAMIC RESULTS FROM SOLR */}
              {/* TODO: The Results Must be Displayed in a Result Page With the Highlighted Snippets, and the ability to view the full document or change filiters and have facets like Skroutz */}
              {query && !loading && results.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2 px-2">Αποτελέσματα Νομολογίας <span className="text-gray-600 ml-1">{results.length}</span></p>
                  <div className="flex flex-col gap-2">
                    {results.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleResultClick(item.pdf_path, item.arithmos, item.katigoria)}
                        className="group flex flex-col px-3 py-3 rounded-xl bg-[#2a2a2c] border border-gray-700/50 hover:border-yellow-500/50 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-yellow-500/80" />
                            <span className="text-sm font-bold text-white">{item.arithmos}</span>
                          </div>
                          <span className="text-xs px-2 py-0.5 bg-[#1e1e1e] text-gray-400 rounded-md border border-gray-700">
                            {item.dikastirio} • {item.etos}
                          </span>
                        </div>
                        {/* Το snippet με το <mark> από το Solr */}
                        <p
                          className="text-xs text-gray-400 line-clamp-2 mt-1 ml-6"
                          dangerouslySetInnerHTML={{ __html: item.snippet || item.titlos }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {query && !loading && results.length === 0 && (
                <div className="text-center text-gray-500 py-10 text-sm">
                  Δεν βρέθηκαν αποφάσεις για "{query}"
                </div>
              )}

            </div>

            <div className="px-4 py-3 border-t border-gray-800/60 bg-[#1a1a1c] text-xs text-gray-500 flex justify-between">
              <span>Γράψτε για αναζήτηση...</span>
              <span>Esc για κλείσιμο</span>
            </div>
          </div>
        </div>
      )}

      {/* --- PDF VIEWER --- */}
      {/* TODO: Make PDF Viewer an overlay  */}
      {activePdfUrl && (
        <div className="fixed inset-0 z-50 bg-[#0d0d0f] flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-[#151518]">
            <div className="flex items-center gap-3">
              <FileText className="w-6 h-6 text-yellow-500" />
              <span className="font-medium">Προβολή Εγγράφου</span>
            </div>
            <button onClick={() => setActivePdfUrl(null)} className="p-2 hover:bg-gray-800 rounded-full transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center bg-[#1a1a1c]">
            <iframe
              src={activePdfUrl}
              className="w-full max-w-5xl h-full bg-white rounded-t-lg shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* --- AI CHATBOT (Placeholder) --- */}
      {/* TODO: The ChatBot Must Be a Full Page */}
      {showChatbot && (
        <div className="fixed bottom-24 right-8 z-40 w-96 h-[500px] bg-[#1c1c1e] border border-gray-700/50 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="bg-gradient-to-r from-gray-800 to-gray-900 p-4 border-b border-gray-700 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-yellow-400" />
              <span className="font-bold text-sm">Nomologia AI Assistant</span>
            </div>
            <button onClick={() => setShowChatbot(false)} className="text-gray-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-[#151518]">
            <div className="bg-[#2a2a2c] p-3 rounded-xl rounded-tl-none w-[85%] text-sm text-gray-300">
              Γεια σας! Είμαι ο AI βοηθός της Nomologia. Πώς μπορώ να σας βοηθήσω; Μπορώ να εξηγήσω νομικούς όρους, να συνοψίσω αποφάσεις ή να βρω σχετική νομοθεσία.
            </div>
          </div>
          <div className="p-3 border-t border-gray-700 bg-[#1c1c1e]">
            <div className="relative">
              <input
                type="text"
                placeholder="Ρωτήστε κάτι..."
                className="w-full bg-[#2a2a2c] text-white text-sm rounded-full pl-4 pr-10 py-2.5 outline-none border border-transparent focus:border-yellow-500/50"
              />
              <button className="absolute right-2 top-1.5 p-1 bg-yellow-500 rounded-full text-black">
                <Command className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{
        __html: `
        .style-outline { -webkit-text-stroke: 1px rgba(255,255,255,0.1); }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #555; }
        mark { background-color: rgba(234, 179, 8, 0.3); color: #facc15; font-weight: bold; border-radius: 2px; padding: 0 2px; }
      `}} />
    </div>
  );
}