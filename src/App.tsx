import { BrowserRouter, Routes, Route } from 'react-router-dom'
import SessionExplorer from './pages/SessionExplorer'
import SessionViewer from './pages/SessionViewer'

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<SessionExplorer />} />
                <Route path="/session/:id" element={<SessionViewer />} />
            </Routes>
        </BrowserRouter>
    )
}
