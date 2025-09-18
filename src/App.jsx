import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button.jsx'
import { ThemeToggle } from './components/ThemeToggle'
import { Music } from 'lucide-react'
import CustomVideoSlider from "./components/ui/CustomVideoSlider";
import VideoList from "./components/ui/VideoList";
import './App.css'

const translations = {
  en: {
    nav: [
      'HOME',
      'ELECTROACOUSTIC & INSTRUMENTAL',
      'SOUND DESIGN',
      'SOUNDTRACKS',
      'ABOUT',
      'CONTACT',
    ],
    home: {
      title: "Hi, I'm Rafael H. Camargo, composer, teacher, sound designer",
      subtitle: 'Blending field recordings, synthesis, and spatial textures to craft immersive sound worlds.',
      showreel: 'See a little of my work: Press Play: • Electroacoustic composition • Sound design for visuals • Instrumental music',
    },
    electroacoustic: 'ELECTROACOUSTIC & INSTRUMENTAL PROJECTS',
    sounddesign: 'SOUND DESIGN PROJECTS',
    soundtracks: 'SOUNDTRACKS FOR FILMS AND GAMES',
    inprogress: 'in progress',
    about: {
      title: 'ABOUT',
      p1: "I'm a composer specializing in electroacoustic and chamber music.",
      p2: "With a Bachelor's in Music Composition from UNESP and training at Conservatório de Tatuí, I combine field recordings, synthesis, and spatial techniques to explore the boundaries of sound.",
      p3: 'My toolkit includes Reaper, iZotope RX, Max/MSP, Wwise, and Unity.',
      p4: "Fluent in English and Portuguese, I'm eager to collaborate on projects that push the art of listening forward.",
    },
    contact: {
      title: 'CONTACT',
      email: '✉️ rhcoliveira@gmail.com',
      linkedin: 'LinkedIn',
      youtube: 'YouTube',
      form: {
        name: 'Name',
        surname: 'Surname',
        email: 'Email',
        message: 'Message',
        send: 'Send',
      },
    },
    demoreel: {
      title: 'Demoreel - Resound of game trailers',
      desc: 'A quick demoreel of some sound designs for game trailers. All original audio was removed and recreated from scratch by me, from music to SFX.'
    }
  },
  pt: {
    nav: [
      'HOME',
      'ELETROACÚSTICA & INSTRUMENTAL',
      'SOUND DESIGN',
      'SOUNDTRACKS',
      'SOBRE',
      'CONTATO',
    ],
    home: {
      title: 'Olá, sou Rafael H. Camargo, compositor, professor, sound designer',
      subtitle: 'Misturando gravações de campo, síntese e texturas espaciais para criar mundos sonoros imersivos.',
      showreel: 'Veja um pouco do meu trabalho: Aperte Play: • Composição eletroacústica • Sound design para visuais • Música instrumental',
    },
    electroacoustic: 'PROJETOS DE ELETROACÚSTICA E INSTRUMENTAL',
    sounddesign: 'PROJETOS DE SOUND DESIGN',
    soundtracks: 'TRILHAS SONORAS PARA FILMES E JOGOS',
    inprogress: 'em andamento',
    about: {
      title: 'SOBRE',
      p1: 'Sou compositor especializado em música eletroacústica e de câmara.',
      p2: 'Com bacharelado em Composição Musical pela UNESP e formação no Conservatório de Tatuí, combino gravações de campo, síntese e técnicas espaciais para explorar os limites do som.',
      p3: 'Meu kit inclui Reaper, iZotope RX, Max/MSP, Wwise e Unity.',
      p4: 'Fluente em inglês e português, busco colaborar em projetos que expandam a arte da escuta.',
    },
    contact: {
      title: 'CONTATO',
      email: '✉️ rhcoliveira@gmail.com',
      linkedin: 'LinkedIn',
      youtube: 'YouTube',
      form: {
        name: 'Nome',
        surname: 'Sobrenome',
        email: 'Email',
        message: 'Mensagem',
        send: 'Enviar',
      },
    },
    demoreel: {
      title: 'Demoreel - Resound de trailers de jogos',
      desc: 'Um rápido demoreel de alguns sound designs para trailers de jogos. Todo som dos vídeos originais foi retirado e produzido novamente do zero por mim, desde as músicas até os SFX.'
    }
  },
  es: {
    nav: [
      'HOME',
      'ELECTROACÚSTICA & INSTRUMENTAL',
      'SOUND DESIGN',
      'SOUNDTRACKS',
      'SOBRE',
      'CONTACTO',
    ],
    home: {
      title: 'Hola, soy Rafael H. Camargo, compositor, profesor, diseñador de sonido',
      subtitle: 'Combinando grabaciones de campo, síntesis y texturas espaciales para crear mundos sonoros inmersivos.',
      showreel: 'Vea un poco de mi trabajo: Presione Play: • Composición electroacústica • Diseño de sonido para visuales • Música instrumental',
    },
    electroacoustic: 'PROYECTOS DE ELECTROACÚSTICA E INSTRUMENTAL',
    sounddesign: 'PROYECTOS DE SOUND DESIGN',
    soundtracks: 'BANDAS SONORAS PARA PELÍCULAS Y JUEGOS',
    inprogress: 'en progreso',
    about: {
      title: 'SOBRE',
      p1: 'Soy compositor especializado en música electroacústica y de cámara.',
      p2: 'Con licenciatura en Composición Musical por la UNESP y formación en el Conservatorio de Tatuí, combino grabaciones de campo, síntesis y técnicas espaciales para explorar los límites del sonido.',
      p3: 'Mi kit incluye Reaper, iZotope RX, Max/MSP, Wwise y Unity.',
      p4: 'Fluido en inglés y portugués, busco colaborar en proyectos que expandan el arte de la escucha.',
    },
    contact: {
      title: 'CONTACTO',
      email: '✉️ rhcoliveira@gmail.com',
      linkedin: 'LinkedIn',
      youtube: 'YouTube',
      form: {
        name: 'Nombre',
        surname: 'Apellido',
        email: 'Email',
        message: 'Mensaje',
        send: 'Enviar',
      },
    },
    demoreel: {
      title: 'Demoreel - Resound de trailers de juegos',
      desc: 'Un rápido demoreel de algunos sound designs para trailers de juegos. Todo el sonido de los videos originales fue retirado y producido nuevamente desde cero por mí, desde la música hasta los SFX.'
    }
  }
};

function App() {
  const [activeTab, setActiveTab] = useState('home')
  const [language, setLanguage] = useState('pt');

  const tabs = [
    { id: 'home', label: 'HOME' },
    { id: 'electroacoustic', label: 'ELETROACÚSTICA & INSTRUMENTAL' },
    { id: 'sounddesign', label: 'SOUND DESIGN' },
    { id: 'soundtracks', label: 'SOUNDTRACKS' },
    { id: 'about', label: 'ABOUT' },
    { id: 'contact', label: 'CONTACT' }
  ]

  const pageVariants = {
    initial: { opacity: 0 },
    in: { opacity: 1 },
    out: { opacity: 0 }
  }

  const pageTransition = {
    type: 'tween',
    ease: 'anticipate',
    duration: 0.6
  }

  const renderContent = () => {
    const t = translations[language];
    switch (activeTab) {
      case 'home':
        return (
          <motion.div
            className="home-content fade-motion in"
            key="home"
            initial="initial"
            animate="in"
            exit="out"
            variants={pageVariants}
            transition={pageTransition}
          >
            <div className="hero-section">
              <h1 className="hero-title">
                {t.home.title}
              </h1>
              <p className="hero-subtitle text-marinho dark:text-marinho">
                {t.home.subtitle}
              </p>
            </div>
            <div className="showreel-container">
              <CustomVideoSlider language={language} />
              <div className="showreel-description">
                {t.home.showreel}
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
            <h2 className="section-title text-marinho dark:text-marinho border-b-2 border-marinho mb-4 pb-2">{t.electroacoustic}</h2>
            <VideoList language={language} />
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
            <h2 className="section-title text-marinho dark:text-marinho border-b-2 border-marinho mb-4 pb-2">{t.sounddesign}</h2>
            <div className="sounddesign-slider" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: 1000, margin: '0 auto', marginBottom: 32 }}>
              <div style={{
                background: 'var(--color-bg-glass)',
                border: '1.5px solid var(--color-border)',
                color: 'var(--color-primary)',
                width: '100%',
                maxWidth: 900,
                borderRadius: 18,
                boxShadow: '0 4px 24px 0 rgba(0,0,0,0.13)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: 32
              }}>
                <div style={{ fontWeight: 700, fontSize: 24, color: '#fff', marginBottom: 18, textAlign: 'center', textShadow: '0 2px 8px #0007', width: '100%' }}>
                  {t.demoreel.title}
                </div>
                <iframe
                  width="800"
                  height="450"
                  src="https://www.youtube.com/embed/HzZW1iWsiIY"
                  title="Demoreel - Resound of game trailers"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  style={{ display: 'block', margin: '0 auto', borderRadius: 18, boxShadow: '0 4px 24px 0 rgba(0,0,0,0.13)', background: 'black', maxWidth: '100%' }}
                ></iframe>
                <div style={{ color: 'var(--color-primary)', fontWeight: 'bold', textAlign: 'center', marginTop: 18, maxWidth: 700 }}>
                  {t.demoreel.desc}
                </div>
              </div>
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
            <h2 className="section-title text-marinho dark:text-marinho border-b-2 border-marinho mb-4 pb-2">{t.soundtracks}</h2>
            <div className="project-item" style={{ textAlign: 'center', color: '#444', fontSize: 20, margin: '48px 0' }}>
              {t.inprogress}
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
            <h2 className="section-title text-marinho dark:text-marinho border-b-2 border-marinho mb-4 pb-2">{t.about.title}</h2>
            <p className="text-marinho dark:text-marinho">{t.about.p1}</p>
            <p className="text-marinho dark:text-marinho">{t.about.p2}</p>
            <p className="text-marinho dark:text-marinho">{t.about.p3}</p>
            <p className="text-marinho dark:text-marinho">{t.about.p4}</p>
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
            <h2 className="section-title text-marinho dark:text-marinho border-b-2 border-marinho mb-4 pb-2">{t.contact.title}</h2>
            <div className="contact-info">
              <p className="text-marinho dark:text-marinho">✉️ rhc.oliveira@unesp.br</p>
              <p className="text-marinho dark:text-marinho">
                <a href="https://www.linkedin.com/in/rafael-oliveira-5b5332229/" target="_blank" rel="noopener noreferrer" style={{ color: '#0072b1', textDecoration: 'underline' }}>{t.contact.linkedin}</a>
              </p>
              <p className="text-marinho dark:text-marinho">
                <a href="https://www.youtube.com/@rafaelhcamargo-compositor7543" target="_blank" rel="noopener noreferrer" style={{ color: '#c4302b', textDecoration: 'underline' }}>{t.contact.youtube}</a>
              </p>
              <form style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 400 }} onSubmit={e => { e.preventDefault(); window.location = `mailto:rhc.oliveira@unesp.br?subject=Contato%20via%20portfolio&body=${t.contact.form.name}:%20${e.target.nome.value}%0A${t.contact.form.surname}:%20${e.target.sobrenome.value}%0A${t.contact.form.email}:%20${e.target.email.value}%0A${t.contact.form.message}:%20${e.target.mensagem.value}`; }}>
                <input name="nome" type="text" placeholder={t.contact.form.name} required style={{ padding: 8, borderRadius: 8, border: '1px solid #bbb' }} />
                <input name="sobrenome" type="text" placeholder={t.contact.form.surname} required style={{ padding: 8, borderRadius: 8, border: '1px solid #bbb' }} />
                <input name="email" type="email" placeholder={t.contact.form.email} required style={{ padding: 8, borderRadius: 8, border: '1px solid #bbb' }} />
                <textarea name="mensagem" placeholder={t.contact.form.message} required style={{ padding: 8, borderRadius: 8, border: '1px solid #bbb', minHeight: 80 }} />
                <button type="submit" className="cv-button bg-vinho text-white hover:bg-marinho hover:text-vinho" style={{ marginTop: 8 }}>{t.contact.form.send}</button>
              </form>
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
          {translations[language].nav.map((label, idx) => (
            <button
              key={tabs[idx].id}
              className={`nav-button px-4 py-2 rounded font-bold transition-colors duration-300
                ${activeTab === tabs[idx].id ? 'active' : ''}
              `}
              onClick={() => setActiveTab(tabs[idx].id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="theme-toggle-container">
          <ThemeToggle />
        </div>
        <div className="lang-switcher" style={{ marginLeft: 16 }}>
          {[ // Bandeiras atualizadas para paleta e Brasil correto
            {
              lang: 'pt',
              label: 'PT',
              svg: (
                <svg className="lang-flag-brasil" viewBox="0 0 32 32">
                  <circle cx="16" cy="16" r="16" fill="#3EAD3A" />
                  <polygon points="16,7 27,16 16,25 5,16" fill="#FFCC29" />
                  <ellipse cx="16" cy="16" rx="6" ry="6" fill="#1A2A4F" />
                  <text x="16" y="19" textAnchor="middle" fontSize="6" fill="#fff" fontFamily="Arial" fontWeight="bold">BR</text>
                </svg>
              )
            },
            {
              lang: 'en',
              label: 'EN',
              svg: (
                <svg className="lang-flag" viewBox="0 0 32 32">
                  <rect width="32" height="32" rx="16" fill="#00247d" />
                  <rect y="12" width="32" height="8" fill="#fff" />
                  <rect x="12" height="32" width="8" fill="#fff" />
                  <rect y="14" width="32" height="4" fill="#cf142b" />
                  <rect x="14" height="32" width="4" fill="#cf142b" />
                </svg>
              )
            },
            {
              lang: 'es',
              label: 'ES',
              svg: (
                <svg className="lang-flag" viewBox="0 0 32 32">
                  <rect width="32" height="32" rx="16" fill="#aa151b" />
                  <rect y="8" width="32" height="16" fill="#f1bf00" />
                </svg>
              )
            }
          ].map(({ lang, label, svg }) => (
            <button
              key={lang}
              onClick={() => setLanguage(lang)}
              className={`lang-btn${language === lang ? ' active' : ''}`}
              aria-label={`Switch to ${lang}`}
            >
              {svg}
              {label}
            </button>
          ))}
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

