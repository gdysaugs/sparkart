import { Navigate, Route, Routes } from 'react-router-dom'
import { LegalNotice } from './pages/LegalNotice'
import { Purchase } from './pages/Purchase'
import { Video } from './pages/Video'

export function App() {
  return (
    <Routes>
      <Route path='/' element={<Video />} />
      <Route path='/video' element={<Video />} />
      <Route path='/tokushoho' element={<LegalNotice />} />
      <Route path='/purchase' element={<Purchase />} />
      <Route path='/sparkart' element={<Navigate to='/video' replace />} />
      <Route path='*' element={<Navigate to='/' replace />} />
    </Routes>
  )
}
