"use client"

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { app } from "@/lib/firebase";


type Job = {
    title?: string;
    description?: string;
    location?: string;
    vehicleType?: string;
    pay?: number;

    businessId?: string;
    businessName?: string;

    status?: string;

    createdAt?: Date | null;
    expiry?: Date | null;

};

const formatDateTime = (d?: Date | null) => {
    if (!d) return "-";
    return d.toLocaleDateString();
};

const formatMoney = (pay?: number) => {
    if (pay==null || Number.isNaN(pay)) return "-";

    return `R ${pay.toLocaleString()}`;
};

export default function DriverJobDetailsPage(){
    const {jobId} = useParams<{ jobId: string}>();
    const router = useRouter();

    const auth = useMemo(() => (app ? getAuth(app) : null),[]);
    const db = useMemo(() => (app ? getFirestore(app) : null), []);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [job, setJob] = useState<Job | null>(null);

    useEffect(() =>{
        if (!jobId) return;
        if (!auth || !db) return;

        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                router.push("/login");
                return;
            }

            try {
                setLoading(true);
                setError(null);

                const jobRef = doc(db, "jobs", jobId);
                const snap = await getDoc(jobRef);

                if (!snap.exists()) {
                    setJob(null);
                    setError("Job not found.");
                    return;
                }

                const data = snap.data() as any;

                setJob({
                    title:data.title,
                    description: data.description,
                    location: data.location,
                    vehicleType: data.vehicleType,
                    pay:data.pay,

                    businessId: data.businessId,
                    businessName: data.businessName,

                    status: data.status,

                    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
                    expiry: data.expiry?.toDate ? data.expiry.toDate() : null,
                });
            } catch (e: any) {
                console.error(e);
                setError(e.message || "Failed to load job.");

            } finally {
                setLoading(false);

            }
        });

        return () => unsub();
    }, [auth, db, jobId, router]);

    return (
        <div className = "p-6 max-w-3xl mx-auto space-y-4">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold">Job Details</h1>
                    <p className="text-sm text-gray-600 break-all">Job ID: {jobId}</p>
                </div>

                <button
                    onClick={() => router.back()}
                    className="px-3 py-2 rounded-lg border text-sm hover:bg-gray-50"
                >
                    Back

                </button>
            </div>

            {loading && <p className="text-sm text-gray-500">Loading job...</p>}
            {error && !loading && <p className="text-sm text-red-600">{error}</p>}

            {!loading && !error && job && (
                <div className="bg-white border rounded-lg shadow p-5 space-y-4">
                    <div>
                        <h2 className="text-xl font-semibold">{job.title || "Untitled job"}</h2>
                        <p className="text-sm text-gray-600 mt-1">
                        Posted by: {job.businessName || "Unknown business"}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div className="p-3 border rounded-lg">
                        <p className="text-gray-500 text-xs">Location</p>
                        <p className="font-medium">{job.location || "—"}</p>
                        </div>

                        <div className="p-3 border rounded-lg">
                        <p className="text-gray-500 text-xs">Vehicle Type</p>
                        <p className="font-medium">{job.vehicleType || "—"}</p>
                        </div>

                        <div className="p-3 border rounded-lg">
                        <p className="text-gray-500 text-xs">Pay</p>
                        <p className="font-medium">{formatMoney(job.pay)}</p>
                        </div>

                        <div className="p-3 border rounded-lg">
                        <p className="text-gray-500 text-xs">Status</p>
                        <p className="font-medium">{job.status || "—"}</p>
                        </div>

                        <div className="p-3 border rounded-lg">
                        <p className="text-gray-500 text-xs">Created</p>
                        <p className="font-medium">{formatDateTime(job.createdAt)}</p>
                        </div>

                        <div className="p-3 border rounded-lg">
                        <p className="text-gray-500 text-xs">Expiry</p>
                        <p className="font-medium">{formatDateTime(job.expiry)}</p>
                        </div>
                    </div>

                    <div>
                        <p className="text-gray-500 text-xs">Description</p>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap mt-1">
                        {job.description || "No description provided."}
                        </p>
                    </div>

                    <div className="pt-2 flex gap-2">
                        <button
                        type="button"
                        onClick={() => router.push("/driver/chats")}
                        className="px-4 py-2 rounded-lg border text-sm hover:bg-gray-50"
                        >
                        Back to Chats
                        </button>
                    </div>
                </div>
            )}
        </div>

    );
}