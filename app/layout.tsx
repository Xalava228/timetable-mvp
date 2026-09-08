import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Личное расписание — PDF в Excel',description:'Личное расписание преподавателя из общих PDF по исходному шаблону Excel.'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="ru"><body>{children}</body></html>}
