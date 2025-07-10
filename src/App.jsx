import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button.jsx'
import { ThemeToggle } from './components/ThemeToggle'
import './App.css'

function App() {
  const [activeTab, setActiveTab] = useState('home')

  const tabs = [
    { id: 'home', label: 'HOME' },
    { id: 'electroacoustic', label: 'ELETROACÚSTICA & INSTRUMENTAL' },
    { id: 'sounddesign', label: 'SOUND DESIGN' },
    { id: 'soundtracks', label: 'SOUNDTRACKS' },
    { id: 'about', label: 'ABOUT' },
    { id: 'contact', label: 'CONTACT' }
  ]

  const pageVariants = {
    initial: { opacity: 0, x: 20 },
    in: { opacity: 1, x: 0 },
    out: { opacity: 0, x: -20 }
  }

  const pageTransition = {
    type: 'tween',
    ease: 'anticipate',
    duration: 0.3
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return (
          <motion.div 
            className="home-content"
            key="home"
            initial="initial"
            animate="in"
            exit="out"
            variants={pageVariants}
            transition={pageTransition}
          >
            <div className="hero-section">
              <h1 className="hero-title">
                Hi, I'm Rafael H. Camargo – Electroacoustic Composer & Sound Designer
              </h1>
              <p className="hero-subtitle">
                Blending field recordings, synthesis, and spatial textures to craft immersive sound worlds.
              </p>
              <div className="showreel-container">
                <div className="video-placeholder">
                  [SHOWREEL VIDEO PLACEHOLDER]
                </div>
                <p className="showreel-description">
                  This reel showcases my work in: • Electroacoustic composition • Sound design for visuals • Interactive audio systems
                </p>
              </div>
            </div>
          </motion.div>
        )
      case 'electroacoustic':
        return (
          <motion.div 
            className="project-content"
            key="electroacoustic"
            initial="initial"
            animate="in"
            exit="out"
            variants={pageVariants}
            transition={pageTransition}
          >
            <h2 className="section-title">PROJETOS DE ELETROACÚSTICA E INSTRUMENTAL</h2>
            <div className="project-item">
              <h3>Acousmatic Piece – Forest Echoes</h3>
              <p>A 2–3 minute acousmatic piece built from field recordings (leaves, water, wood) and granular synthesis.</p>
              <p>Techniques: time‑stretch, spectral filtering, spatialization.</p>
              <p>Goal: evoke the feeling of wandering through a primeval forest.</p>
              <div className="media-placeholder">[AUDIO PLAYER PLACEHOLDER]</div>
            </div>
          </motion.div>
        )
      case 'sounddesign':
        return (
          <motion.div 
            className="project-content"
            key="sounddesign"
            initial="initial"
            animate="in"
            exit="out"
            variants={pageVariants}
            transition={pageTransition}
          >
            <h2 className="section-title">PROJETOS DE SOUND DESIGN</h2>
            <div className="project-item">
              <h3>Interactive / Spatial Installation – Resonant Touch</h3>
              <p>Platform: Max/MSP patch triggering granular textures via MIDI sensors.</p>
              <p>Interaction: user movement alters density and pitch of textures.</p>
              <p>Intent: blur the line between composer and listener, creating an evolving sound sculpture.</p>
              <div className="media-placeholder">[VIDEO DEMO PLACEHOLDER]</div>
            </div>
          </motion.div>
        )
      case 'soundtracks':
        return (
          <motion.div 
            className="project-content"
            key="soundtracks"
            initial="initial"
            animate="in"
            exit="out"
            variants={pageVariants}
            transition={pageTransition}
          >
            <h2 className="section-title">SOUNDTRACKS DE FILMES E JOGOS</h2>
            <div className="project-item">
              <h3>Sound + Music for Visual Scene – Urban Twilight</h3>
              <p>Brief: Sonic reimagining of a 90-second urban night scene.</p>
              <p>Tools: Reaper, iZotope RX, virtual pads.</p>
              <p>Outcome: integrated ambiences, Foley, and atmospheric score for a seamless audiovisual experience.</p>
              <div className="media-placeholder">[VIDEO EMBED PLACEHOLDER]</div>
            </div>
          </motion.div>
        )
      case 'about':
        return (
          <motion.div 
            className="about-content"
            key="about"
            initial="initial"
            animate="in"
            exit="out"
            variants={pageVariants}
            transition={pageTransition}
          >
            <h2 className="section-title">ABOUT</h2>
            <p>I'm a composer specializing in electroacoustic and chamber music.</p>
            <p>With a Bachelor's in Music Composition from UNESP and training at Conservatório de Tatuí, I combine field recordings, synthesis, and spatial techniques to explore the boundaries of sound.</p>
            <p>My toolkit includes Reaper, iZotope RX, Max/MSP, Wwise, and Unity.</p>
            <p>Fluent in English and Portuguese, I'm eager to collaborate on projects that push the art of listening forward.</p>
          </motion.div>
        )
      case 'contact':
        return (
          <motion.div 
            className="contact-content"
            key="contact"
            initial="initial"
            animate="in"
            exit="out"
            variants={pageVariants}
            transition={pageTransition}
          >
            <h2 className="section-title">CONTACT</h2>
            <div className="contact-info">
              <p>✉️ rhc.oliveira@unesp.br</p>
              <p>🔗 linkedin.com/in/rafaelcamargo</p>
              <p>▶️ youtube.com/@rafaelhcamargo-compositor7543</p>
              <Button className="cv-button">Download CV (EN)</Button>
            </div>
          </motion.div>
        )
      default:
        return null
    }
  }

  return (
    <div className="app">
      <nav className="navigation">
        <div className="nav-grid">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`nav-button ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="theme-toggle-container">
          <ThemeToggle />
        </div>
      </nav>
      
      <main className="main-content">
        <AnimatePresence mode="wait">
          {renderContent()}
        </AnimatePresence>
      </main>
    </div>
  )
}

export default App

