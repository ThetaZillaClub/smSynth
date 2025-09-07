'use client'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useLayoutEffect } from 'react'

gsap.registerPlugin(ScrollTrigger)

export default function Features() {
  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      ScrollTrigger.batch('.raise-in', {
        start: 'top 95%',
        once: true,
        onEnter: (batch) =>
          gsap.to(batch, { opacity: 1, y: 0, duration: 0.6, stagger: 0.2, ease: 'power1.out' }),
      })
    })
    return () => ctx.revert()
  }, [])

  const features = [
    {
      title: 'Training',
      description: 'Train custom singing models with our gamified interface. Upload data, fine-tune, and create unique voices effortlessly.',
      image: '/placeholder-training.jpg'
    },
    {
      title: 'Model Library',
      description: 'Browse and use a vast collection of public singing models. Share your creations or keep them private.',
      image: '/placeholder-library.jpg'
    },
    {
      title: 'Prompt Conversion',
      description: 'Convert raw audio to custom vocals using prompts. Transform any sound into your model\'s voice instantly.',
      image: '/placeholder-conversion.jpg'
    },
    {
      title: 'DAW Plugin',
      description: 'Integrate smSynth directly into your Digital Audio Workstation for seamless workflow in music production.',
      image: '/placeholder-plugin.jpg'
    }
  ]

  return (
    <section
      id="features"
      className="
        pt-24 pb-24 w-full
        flex flex-col items-center justify-center
        bg-gradient-to-b from-[#f0f0f0] to-[#d2d2d2]
        scroll-mt-20
      "
    >
      <h2
        className="
          mx-auto text-center max-w-xl
          text-3xl sm:text-4xl md:text-5xl
          font-bold leading-tight mb-16 raise-in opacity-0 translate-y-10
        "
      >
        Key Features
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl px-6">
        {features.map((feature, index) => (
          <div 
            key={index} 
            className="bg-[#ebebeb] border border-[#d2d2d2] rounded-lg p-6 shadow-md raise-in opacity-0 translate-y-10"
          >
            <div className="bg-gray-300 h-48 w-full mb-4 rounded" />
            <h3 className="text-xl font-semibold mb-2 text-[#0f0f0f]">{feature.title}</h3>
            <p className="text-sm text-[#373737]">{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  )
}