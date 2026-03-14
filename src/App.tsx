import { Navigate, Route, Routes } from 'react-router-dom'
import { Video } from './pages/Video'

export function App() {
  return (
    <Routes>
      <Route path='/' element={<Video />} />
      <Route path='/video' element={<Video />} />
      <Route path='/sparkart' element={<Navigate to='/video' replace />} />
      <Route path='/purchase' element={<Navigate to='/video' replace />} />
      <Route path='*' element={<Navigate to='/' replace />} />
    </Routes>
  )
}
