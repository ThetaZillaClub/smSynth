'use client'
import Link from 'next/link'

export default function MyModels() {
  const models = [
    { id: 'model1', name: 'model1', image: '/placeholder-model.jpg' },
    { id: 'create', name: 'Create New Model', image: '/placeholder-create.jpg' },
  ];

  return (
    <section className="w-full py-12">
      <h2 className="text-3xl font-bold mb-8 text-[#0f0f0f] text-center">My Models</h2>
      <div className="flex flex-wrap justify-center gap-8 max-w-4xl mx-auto">
        {models.map((model) => (
          <Link 
            key={model.id} 
            href={model.id === 'create' ? "/model-settings" : `/model/${model.id}`}
            className="flex flex-col items-center bg-[#ebebeb] border border-[#d2d2d2] rounded-lg shadow-md hover:shadow-lg transition-shadow basis-[calc(50%-1rem)] max-w-[calc(50%-1rem)] sm:max-w-none"
          >
            <div className="w-full aspect-square bg-gray-300 rounded-t-lg overflow-hidden">
              <img src={model.image} alt={model.name} className="w-full h-full object-cover" />
            </div>
            <p className="py-4 text-center font-medium text-[#0f0f0f]">{model.name}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}