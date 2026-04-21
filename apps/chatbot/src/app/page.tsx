export default function PublicChatbot() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500">
      <div className="z-10 max-w-lg w-full bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[600px]">
        <div className="p-4 bg-indigo-600 text-white font-bold flex items-center justify-between">
          <span>AI Support Agent</span>
          <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
        </div>
        <div className="flex-1 p-6 overflow-y-auto space-y-4 text-slate-800">
          <div className="flex justify-start">
            <div className="bg-slate-200 p-3 rounded-lg max-w-[80%] text-sm">
              Hello! How can I help you today?
            </div>
          </div>
          <div className="flex justify-end">
            <div className="bg-indigo-500 text-white p-3 rounded-lg max-w-[80%] text-sm">
              I'm looking for order status.
            </div>
          </div>
        </div>
        <div className="p-4 border-t border-slate-200 bg-white">
          <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="Type your message..." 
              className="flex-1 p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
            />
            <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
              Send
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
