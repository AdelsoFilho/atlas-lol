import { BrowserRouter, Routes, Route } from "react-router-dom";
import { PlayerProvider } from "./context/PlayerContext";
import Sidebar         from "./components/Sidebar";
import HomeView        from "./views/HomeView";
import HistoryView     from "./views/HistoryView";
import MatchDetailView from "./views/MatchDetailView";
import DraftView       from "./views/DraftView";
import SettingsView    from "./views/SettingsView";

// =============================================================================
// App — Atlas LoL Pro Analytics
//
// Estrutura:
//   BrowserRouter
//   └── PlayerProvider (estado global do jogador)
//       └── AppLayout
//           ├── Sidebar (fixa, 240px)
//           └── Área dinâmica (roteada)
//               ├── /            → HomeView
//               ├── /history     → HistoryView
//               ├── /match/:id   → MatchDetailView
//               ├── /draft       → DraftView
//               └── /settings    → SettingsView
// =============================================================================

function AppLayout() {
  return (
    <div className="flex min-h-screen bg-navy-950">
      <Sidebar />
      {/* ml-60 = 240px = largura da sidebar */}
      <main className="flex-1 ml-60 min-h-screen overflow-x-hidden">
        <Routes>
          <Route path="/"           element={<HomeView />} />
          <Route path="/history"    element={<HistoryView />} />
          <Route path="/match/:matchId" element={<MatchDetailView />} />
          <Route path="/draft"      element={<DraftView />} />
          <Route path="/settings"   element={<SettingsView />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <PlayerProvider>
        <AppLayout />
      </PlayerProvider>
    </BrowserRouter>
  );
}
