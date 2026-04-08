import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from 'recharts'
import { motion } from 'framer-motion'

export default function TasteRadar({ data }) {
  if (!data || !data.labels || data.labels.length === 0) {
    return null
  }

  const chartData = data.labels.map((label, idx) => ({
    name: label,
    value: data.values[idx] || 0,
  }))

  return (
    <motion.div
      className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-6"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
    >
      <h3 className="text-lg font-bold text-white mb-4">Taste Radar</h3>
      <ResponsiveContainer width="100%" height={300}>
        <RadarChart data={chartData}>
          <PolarGrid stroke="#ffffff20" />
          <PolarAngleAxis
            dataKey="name"
            tick={{ fill: '#cbd5e1', fontSize: 12 }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fill: '#94a3b8', fontSize: 10 }}
          />
          <Radar
            name="Your Taste"
            dataKey="value"
            stroke="#06b6d4"
            fill="#06b6d4"
            fillOpacity={0.3}
            dot={{ fill: '#06b6d4', r: 4 }}
            animationDuration={800}
          />
        </RadarChart>
      </ResponsiveContainer>
    </motion.div>
  )
}
