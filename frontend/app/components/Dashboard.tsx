'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { jsPDF } from 'jspdf'
import { motion, AnimatePresence } from 'framer-motion' // <-- Import motion and AnimatePresence

// Import UI components
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner' // <-- Use sonner for notifications

// Define the shape of our summary data
type Summary = {
    id: string
    created_at: string
    client_name: string
    structured_summary: string
}

export default function Dashboard() {
    const [isRecording, setIsRecording] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)
    const [clientName, setClientName] = useState('')
    const [latestSummary, setLatestSummary] = useState('')
    const [summaries, setSummaries] = useState<Summary[]>([])
    const [showMicPermissionDialog, setShowMicPermissionDialog] = useState(false)

    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const audioChunksRef = useRef<Blob[]>([])

    const supabase = createClient()
    const router = useRouter()

    // --- 1. Fetch Past Summaries on Load ---
    useEffect(() => {
        const getSummaries = async () => {
            const { data, error } = await supabase
                .from('summaries')
                .select('*')
                .order('created_at', { ascending: false })

            if (!error && data) {
                setSummaries(data)
            }
        }
        getSummaries()
    }, [supabase])

    // --- 2. Handle Microphone Permissions & Recording ---
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            setIsRecording(true)
            setLatestSummary('')
            audioChunksRef.current = []
            const recorder = new MediaRecorder(stream)
            mediaRecorderRef.current = recorder
            recorder.ondataavailable = (event) => {
                audioChunksRef.current.push(event.data)
            }
            recorder.start()
            toast.info('🎙️ Recording started...', {
                description: 'Speak into your microphone.',
            })
        } catch (err) {
            setShowMicPermissionDialog(true)
        }
    }

    const stopRecording = () => {
        if (mediaRecorderRef.current) {
            mediaRecorderRef.current.stop()
            setIsRecording(false)
            toast.success('👍 Recording stopped.', {
                description: "Click 'Process' to get your summary.",
            })
        }
    }

    // --- 3. Process Audio (Send to Backend) ---
    const handleProcessAudio = async () => {
        if (audioChunksRef.current.length === 0) {
            toast.error('No audio recorded', {
                description: 'Please record audio first.',
            })
            return
        }

        setIsProcessing(true)
        setLatestSummary('')
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
            toast.error('Authentication Error', {
                description: 'Please log in again.',
            })
            setIsProcessing(false)
            return
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const formData = new FormData()
        formData.append('file', audioBlob, 'recording.webm')
        formData.append('client_name', clientName)

        try {
            // Use the environment variable for the backend URL
            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
            if (!backendUrl) {
                toast.error("Configuration Error", { description: "Backend URL not set." });
                setIsProcessing(false);
                return;
            }

            const response = await fetch(`${backendUrl}/process-audio/`, { // Use backendUrl
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: formData,
            })

            if (!response.ok) {
                const err = await response.json()
                throw new Error(err.detail || 'Failed to process audio')
            }

            const result = await response.json()
            setLatestSummary(result.structured_summary)

            // Fetch summaries again to include the newly added one from the DB
            // This ensures the ID and created_at are accurate
            const { data, error } = await supabase
                .from('summaries')
                .select('*')
                .order('created_at', { ascending: false })
            if (!error && data) setSummaries(data)


            // Old optimistic update (can cause issues with keys/ids):
            // const newSummary = {
            //   id: Math.random().toString(), // Use a more robust ID in production
            //   created_at: new Date().toISOString(),
            //   client_name: clientName || 'Untitled',
            //   structured_summary: result.structured_summary,
            // }
            // setSummaries(prevSummaries => [newSummary, ...prevSummaries])

            setClientName('') // Clear client name input
            toast.success('🎉 Summary Generated!', {
                description: 'Your new note is ready.',
            })
        } catch (error: any) {
            toast.error('Error', {
                description: error.message,
            })
        } finally {
            setIsProcessing(false)
        }
    }

    // --- 4. Helper Functions (Download & Logout) ---
    const handleDownloadPDF = (summaryText: string, name: string) => {
        const doc = new jsPDF()
        doc.setFont('Helvetica', 'bold')
        doc.setFontSize(16)
        doc.text('JanScribe Summary', 10, 20)
        doc.setFontSize(12)
        doc.setFont('Helvetica', 'normal')
        doc.text(`Client: ${name || 'N/A'}`, 10, 30)
        doc.setFontSize(11)
        const lines = doc.splitTextToSize(summaryText, 180)
        doc.text(lines, 10, 45)
        doc.save(`Summary_${name || 'JanScribe'}.pdf`)
    }

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.push('/login')
        router.refresh()
    }

    // --- 5. The Component UI (JSX) ---
    return (
        <div className="w-full max-w-4xl mx-auto p-4 md:p-8">
            <header className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">
                    JanScribe
                    <span className="text-blue-600">.</span>
                </h1>
                <Button variant="outline" onClick={handleLogout}>
                    Logout
                </Button>
            </header>

            {/* --- Main Recorder Card --- */}
            <Card className="mb-8">
                <CardHeader>
                    <CardTitle>Create New Note</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-6">
                    <div className="grid gap-2">
                        <Label htmlFor="client-name">Client Name (Optional)</Label>
                        <Input
                            id="client-name"
                            placeholder="e.g., Patient John Doe, Acme Corp Case"
                            value={clientName}
                            onChange={(e) => setClientName(e.target.value)}
                        />
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 items-center">
                        {/* Pulsating Record Button */}
                        <motion.div
                            className="w-full sm:w-1/3" // Moved width class here
                            animate={isRecording ? { scale: [1, 1.05, 1], opacity: [1, 0.7, 1] } : {}}
                            transition={isRecording ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" } : {}}
                        >
                            <Button
                                onClick={isRecording ? stopRecording : startRecording}
                                className={`w-full ${isRecording ? 'bg-red-600 hover:bg-red-700' : ''}`}
                            >
                                {isRecording ? 'Stop Recording' : 'Start Recording'}
                            </Button>
                        </motion.div>
                        {/* Process Button */}
                        <Button
                            onClick={handleProcessAudio}
                            className="w-full sm:w-2/3"
                            disabled={isProcessing || isRecording}
                        >
                            {isProcessing ? 'Processing...' : 'Process Audio'}
                        </Button>
                    </div>

                    {/* --- Animated Latest Summary Display --- */}
                    <AnimatePresence>
                        {(isProcessing || latestSummary) && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.5 }}
                                className="grid gap-2 overflow-hidden" // Added overflow-hidden
                            >
                                <Label>Latest Summary</Label>
                                <Textarea
                                    className="min-h-[200px] font-mono" // Standard styling
                                    value={
                                        isProcessing
                                            ? 'Generating your summary...'
                                            : latestSummary
                                    }
                                    readOnly
                                />
                                <Button
                                    variant="default"
                                    onClick={() => handleDownloadPDF(latestSummary, clientName)}
                                    disabled={!latestSummary || isProcessing}
                                >
                                    Download as PDF
                                </Button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </CardContent>
            </Card>

            {/* --- Animated Past Summaries List --- */}
            <div>
                <h2 className="text-2xl font-semibold mb-4">Past Notes</h2>
                <div className="grid gap-4">
                    {summaries.length === 0 && !isProcessing && ( // Hide if processing first note
                        <p className="text-gray-500">
                            Your saved summaries will appear here.
                        </p>
                    )}
                    <AnimatePresence initial={false}> {/* initial=false prevents initial animation on load */}
                        {summaries.map((summary) => (
                            <motion.div
                                key={summary.id} // Key is crucial for AnimatePresence
                                layout // Animates layout changes (like adding items)
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
                                transition={{ duration: 0.3, ease: "easeOut" }}
                            >
                                <Card> {/* Standard styling */}
                                    <CardHeader>
                                        <CardTitle className="flex justify-between items-center">
                                            <span className="font-medium">{summary.client_name || 'Untitled Note'}</span>
                                            <span className="text-sm font-normal text-gray-500">
                                                {new Date(summary.created_at).toLocaleDateString()}
                                            </span>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <Textarea
                                            className="min-h-[100px] font-mono text-sm" // Standard styling
                                            value={summary.structured_summary}
                                            readOnly
                                        />
                                        <Button
                                            variant="outline"
                                            size="sm" // Smaller button
                                            className="mt-3" // Adjusted margin
                                            onClick={() =>
                                                handleDownloadPDF(
                                                    summary.structured_summary,
                                                    summary.client_name
                                                )
                                            }
                                        >
                                            Download PDF
                                        </Button>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            </div>

            {/* --- Mic Permission Dialog --- */}
            <AlertDialog
                open={showMicPermissionDialog}
                onOpenChange={setShowMicPermissionDialog}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Microphone Access Denied</AlertDialogTitle>
                        <AlertDialogDescription>
                            JanScribe needs access to your microphone to record audio. Please
                            click "Allow" in your browser's permission pop-up. You may need
                            to refresh the page or check your browser settings.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogAction onClick={() => setShowMicPermissionDialog(false)}>Got it</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}