"use client";

import { useEffect, useMemo, useState } from "react";
import {collection, getDocs, getFirestore, query, where, Timestamp} from "firebase/firestore";
import { app } from "@/lib/firebase";

type PieDatum = {
    name:string;
    value: number;
};


type AdminDashboardStats = {
    loading: boolean;
    error: string | null;

    activeUsersCount: number;
    jobsPostedCount: number;

    userDistributionData: PieDatum[];
    jobStatusData: PieDatum[];
};

const msFromMinutes = (m: number) => m*60 * 1000;
const msFromDays = (d: number) => d *24 * 60*60*1000;


export function useAdminDashboardStats(activeWindowMinutes: number, jobWindowDays:number){

  /**
   * Firestore client (client SDK)
   * ---------------------------------------------------------------------------
   * The Firebase client app may be `null` when NEXT_PUBLIC_FIREBASE_* environment
   * variables are not configured (e.g. local development, CI, or review builds).
   *
   * To prevent build-time or prerender crashes:
   * - Firestore is initialised only when `app` exists
   * - Otherwise `db` remains null and the hook exits gracefully
   *
   * When environment variables are provided:
   * - `app` becomes available
   * - Firestore initialises normally
   * - No behaviour change from the original implementation
   */
    const db = useMemo(() => (app ? getFirestore(app) : null), [app]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [activeUsersCount, setActiveUsersCount] = useState(0);
    const [jobsPostedCount, setJobsPostedCount] = useState(0);

    const [userDistributionData, setUserDistributionData] = useState<PieDatum[]>([
        { name: "Drivers", value: 0},
        { name: "Businesses", value: 0},

    ]);

    const [jobStatusData, setJobStatusData] = useState<PieDatum[]>([
        { name: "Open", value: 0 },
        { name: "Closed", value: 0 },
    ]);


    const activeCutOffDate = useMemo(() => {
        const cutoffMs = Date.now() - msFromMinutes(activeWindowMinutes);
        return new Date(cutoffMs);
    }, [activeWindowMinutes]);

    const jobsCutoffDate = useMemo(()=>{
        const cutoffMs = Date.now() - msFromDays(jobWindowDays);
        return new Date(cutoffMs);
    }, [jobWindowDays]);

  
    /**
    * Data loading effect
    * ---------------------------------------------------------------------------
    * - Fetches active users and recent jobs within the selected time windows
    * - Computes aggregate counts and distributions for dashboard display
    *
    * Guard behaviour:
    * - If Firestore is not available (missing client env vars),
    *   the effect exits early with a clear error message
    * - This avoids runtime crashes and build-time failures
    */    
    useEffect(()=> {
        const run = async () => {
            setLoading(true);
            setError(null);
            
            // Guard: Firebase client not configured
            if (!db) {
                setLoading(false);
                setError("Firebase is not configured. Missing NEXT_PUBLIC_FIREBASE_* env vars.");
                return;
            }

            try{
                //fetch users + jobs here
                //users query
                const usersRef = collection(db, "users");

                const activeCutoffTs = Timestamp.fromDate(activeCutOffDate);
                const usersQ = query(
                    usersRef,
                    where("lastLoginAt", ">=", activeCutoffTs)
                );

                const usersSnap = await getDocs(usersQ);

                let activeDrivers = 0;
                let activeBusinesses = 0;

                usersSnap.forEach((docSnap) => {
                    const data = docSnap.data() as any;

                    if (data.role === "driver") activeDrivers++;
                    if (data.role === "business") activeBusinesses++;
                });

                setActiveUsersCount(activeDrivers + activeBusinesses);

                setUserDistributionData([
                    { name: "Drivers", value: activeDrivers},
                    {name: "Businesses", value: activeBusinesses},
                ]);


                //jobs query 
                const jobsRef = collection(db, "jobs");
                const jobsCutoffTs = Timestamp.fromDate(jobsCutoffDate);

                const jobsQ = query(
                    jobsRef,
                    where("createdAt", ">=", jobsCutoffTs)
                );

                const jobsSnap = await getDocs(jobsQ);

                setJobsPostedCount(jobsSnap.size);

            let open = 0;
            let closed = 0;

            const now = new Date();

            jobsSnap.forEach((docSnap) => {
            const data = docSnap.data() as any;

            // expiry can be Firestore Timestamp
            const expiry: Date | null =
                data.expiry?.toDate ? data.expiry.toDate() : null;

            const isExpired = !!expiry && expiry <= now;

            // If expired, count as closed (even if Firestore still says "open")
            if (isExpired) {
                closed++;
                return;
            }

            const status = String(data.status || "open").toLowerCase();

            if (status === "open") open++;
            else closed++; // anything not open becomes closed for the dashboard
            });

            setJobStatusData([
            { name: "Open", value: open },
            { name: "Closed", value: closed },
            ]);


            } catch (e:any) {
                console.error(e);
                setError(e?.message || "Failed to load admin dashboard stats.");

            } finally {
                setLoading(false);
            }
        };

        run();
    }, [db, activeCutOffDate, jobsCutoffDate]);

    return {
        loading,
        error,
        activeUsersCount,
        jobsPostedCount,
        userDistributionData,
        jobStatusData,
    };


}