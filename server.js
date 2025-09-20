import express from "express";
import bodyParser from "body-parser";
import pg from "pg";

const app = express();
 const port = process.env.PORT || 3000

// --- Middleware ---
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");

// --- Database Connection ---
const db = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});
db.connect();

// --- Helper Functions ---
function timeToMinutes(time) {
    if (!time || typeof time !== 'string') return 0;
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
}

// --- Routes ---
app.get("/", (req, res) => { res.render("index.ejs"); });
app.get("/login/:role", (req, res) => { res.render("login.ejs", { role: req.params.role, error: null }); });
app.get("/signup/:role", (req, res) => { res.render("signup.ejs", { role: req.params.role, error: null }); });

// --- Auth ---
app.post("/login/:role", async (req, res) => {
    const role = req.params.role;
    const { username, password } = req.body;
    let tableName;
    switch (role) {
        case 'patient': tableName = 'patients'; break;
        case 'doctor': tableName = 'doctors'; break;
        case 'receptionist': tableName = 'receptionists'; break;
        case 'admin': tableName = 'admins'; break;
        default: return res.status(400).send("Invalid role");
    }

    try {
        const result = await db.query(`SELECT * FROM ${tableName} WHERE username = $1`, [username]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            if (password === user.password) { // NOTE: In production, use bcrypt.compare
                res.redirect(`/dashboard/${role}?userId=${user.id}`);
            } else {
                res.render("login.ejs", { role: role, error: "Invalid username or password." });
            }
        } else {
            res.render("login.ejs", { role: role, error: "Invalid username or password." });
        }
    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).send("An error occurred during login.");
    }
});

app.post("/signup/:role", async (req, res) => {
    const role = req.params.role;
    if (role !== 'patient') {
        return res.status(403).send("Signup is only allowed for patients.");
    }

    const { name, dob, mobile, username, password } = req.body;
    if (mobile.length !== 10) {
        return res.render("signup.ejs", { role: role, error: "Mobile number must be exactly 10 digits." });
    }

    try {
        // In production, you should hash the password. Example:
        // const hashedPassword = await bcrypt.hash(password, saltRounds);
        await db.query(
            "INSERT INTO patients (name, dob, mobile, username, password) VALUES ($1, $2, $3, $4, $5)",
            [name, dob, mobile, username, password] // replace 'password' with 'hashedPassword' in production
        );
        res.redirect(`/login/patient`);
    } catch (err) {
        console.error("Signup Error:", err);
        res.render("signup.ejs", { role: role, error: "Username already exists or another error occurred." });
    }
});

// --- Dashboards ---
app.get("/dashboard/patient", async (req, res) => {
    const { userId } = req.query;
    try {
        const patientRes = await db.query("SELECT * FROM patients WHERE id = $1", [userId]);
        if (patientRes.rows.length === 0) return res.redirect('/login/patient');
        const patient = patientRes.rows[0];

        const appointmentsRes = await db.query("SELECT * FROM appointments WHERE patient_id = $1 ORDER BY date DESC, time DESC", [userId]);
        res.render("patient-dashboard.ejs", { patient, appointments: appointmentsRes.rows });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading patient dashboard.");
    }
});

app.get("/dashboard/doctor", async (req, res) => {
    // This route is already well-converted in the provided file.
    const { userId, clinicId } = req.query;
    try {
        const doctorRes = await db.query("SELECT * FROM doctors WHERE id = $1", [userId]);
        if (doctorRes.rows.length === 0) return res.redirect('/login/doctor');
        const doctor = doctorRes.rows[0];
        
        const today = new Date().toISOString().slice(0, 10);
        
        let appointmentsQuery = `SELECT * FROM appointments WHERE doctor_id = $1 AND date = $2 ORDER BY queue_number ASC`;
        const queryParams = [userId, today];
        
        if (clinicId) {
            appointmentsQuery = `SELECT * FROM appointments WHERE doctor_id = $1 AND date = $2 AND clinic_id = $3 ORDER BY queue_number ASC`;
            queryParams.push(clinicId);
        }

        const appointmentsRes = await db.query(appointmentsQuery, queryParams);
        const appointmentsToConsider = appointmentsRes.rows;

        const doneAppointments = appointmentsToConsider.filter(app => app.status === 'Done');
        const isClinicQueueCompleted = appointmentsToConsider.length > 0 && doneAppointments.length >= appointmentsToConsider.length;
        
        const availableAppointments = appointmentsToConsider.filter(app => app.status !== 'Done' && app.status !== 'Absent');
        const currentPatientInfo = availableAppointments[0] || null;
        const nextPatientInfo = availableAppointments[1] || null;

        const display = { current: doneAppointments.length, total: appointmentsToConsider.length };

        const schedulesRes = await db.query("SELECT ds.*, c.name as clinic_name, c.address FROM doctor_schedules ds JOIN clinics c ON ds.clinic_id = c.id WHERE ds.doctor_id = $1", [userId]);
        const schedules = schedulesRes.rows.map(s => ({...s, clinicId: s.clinic_id, clinic: { name: s.clinic_name, address: s.address }}));
        
        const clinicsRes = await db.query("SELECT * FROM clinics");
        
        const requestsRes = await db.query("SELECT * FROM clinic_join_requests WHERE doctor_id = $1", [userId]);
        
        const invitationsRes = await db.query("SELECT ci.*, c.name as clinic_name FROM receptionist_invitations ci JOIN clinics c ON ci.clinic_id = c.id WHERE ci.doctor_id = $1 AND ci.status = 'pending'", [userId]);
        
        const invitations = invitationsRes.rows.map(inv => ({...inv, schedule: { startTime: inv.start_time, endTime: inv.end_time, days: inv.days }}));

        res.render("doctor-dashboard.ejs", {
            doctor,
            appointments: appointmentsToConsider,
            schedules,
            display,
            isClinicQueueCompleted,
            currentPatientInfo,
            nextPatientInfo,
            selectedClinicId: clinicId,
            clinics: clinicsRes.rows,
            doctorRequests: requestsRes.rows,
            invitations
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading doctor dashboard.");
    }
});

app.get("/dashboard/receptionist", async (req, res) => {
    // This route is already well-converted in the provided file.
    const { userId } = req.query;
    try {
        const receptionistRes = await db.query("SELECT * FROM receptionists WHERE id = $1", [userId]);
        if (receptionistRes.rows.length === 0) return res.redirect('/login/receptionist');
        const receptionist = receptionistRes.rows[0];

        const clinicRes = await db.query("SELECT * FROM clinics WHERE id = $1", [receptionist.clinic_id]);
        const clinic = clinicRes.rows[0];

        const appointmentsRes = await db.query("SELECT * FROM appointments WHERE clinic_id = $1", [receptionist.clinic_id]);
        
        const clinicDoctorsRes = await db.query(`
            SELECT d.*, ds.start_time, ds.end_time, ds.days 
            FROM doctors d 
            JOIN doctor_schedules ds ON d.id = ds.doctor_id 
            WHERE ds.clinic_id = $1`, [clinic.id]);
        const clinicDoctors = clinicDoctorsRes.rows.map(d => ({ ...d, schedule: { startTime: d.start_time, endTime: d.end_time, days: d.days } }));

        const allDoctorsRes = await db.query("SELECT * FROM doctors");
        
        const requestsRes = await db.query("SELECT * FROM clinic_join_requests WHERE clinic_id = $1 AND status = 'pending'", [receptionist.clinic_id]);
        
        const invitationsRes = await db.query("SELECT * FROM receptionist_invitations WHERE clinic_id = $1 AND status = 'pending'", [receptionist.clinic_id]);
        const invitations = invitationsRes.rows.map(inv => ({...inv, schedule: { startTime: inv.start_time, endTime: inv.end_time, days: inv.days }}));

        res.render("receptionist-dashboard.ejs", { 
            receptionist, 
            clinic, 
            appointments: appointmentsRes.rows, 
            doctors: clinicDoctors,
            allDoctors: allDoctorsRes.rows,
            joinRequests: requestsRes.rows,
            invitations
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading receptionist dashboard.");
    }
});

app.get("/dashboard/admin", async (req, res) => {
    // This route is correct from the previous step.
    const { userId } = req.query;
    try {
        const adminRes = await db.query("SELECT * FROM admins WHERE id = $1", [userId]);
        if (adminRes.rows.length === 0) return res.redirect('/login/admin');
        const admin = adminRes.rows[0];

        const [patientsRes, doctorsRes, clinicsRes, appointmentsRes, receptionistsRes] = await Promise.all([
            db.query("SELECT * FROM patients ORDER BY id DESC"),
            db.query("SELECT * FROM doctors ORDER BY id DESC"),
            db.query("SELECT * FROM clinics ORDER BY id DESC"),
            db.query("SELECT * FROM appointments ORDER BY id DESC"),
            db.query("SELECT * FROM receptionists ORDER BY id DESC"),
        ]);

        res.render("admin-dashboard.ejs", {
            admin,
            patients: patientsRes.rows,
            doctors: doctorsRes.rows,
            clinics: clinicsRes.rows,
            appointments: appointmentsRes.rows,
            receptionists: receptionistsRes.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading admin dashboard.");
    }
});


// --- Appointment & Scheduling ---
app.post("/book-appointment", async (req, res) => {
    const { patientId, doctorId, clinicId, date } = req.body;
    try {
        const [doctorRes, patientRes, clinicRes, scheduleRes] = await Promise.all([
             db.query("SELECT * FROM doctors WHERE id = $1", [doctorId]),
             db.query("SELECT * FROM patients WHERE id = $1", [patientId]),
             db.query("SELECT * FROM clinics WHERE id = $1", [clinicId]),
             db.query("SELECT * FROM doctor_schedules WHERE doctor_id = $1 AND clinic_id = $2", [doctorId, clinicId])
        ]);

        const doctor = doctorRes.rows[0];
        const patient = patientRes.rows[0];
        const clinic = clinicRes.rows[0];
        const schedule = scheduleRes.rows[0];

        if (!doctor || !patient || !clinic || !schedule) {
            return res.status(404).send("Invalid data provided for booking.");
        }

        const appointmentsTodayRes = await db.query("SELECT COUNT(*) as count FROM appointments WHERE doctor_id = $1 AND date = $2", [doctorId, date]);
        const todaysAppointmentsCount = parseInt(appointmentsTodayRes.rows[0].count);

        if (doctor.daily_limit && todaysAppointmentsCount >= doctor.daily_limit) {
            return res.status(403).send(`Booking Failed: Dr. ${doctor.name}'s schedule for ${date} is full.`);
        }

        const queueNumber = todaysAppointmentsCount + 1;
        let approxTime = schedule.start_time;
        if (doctor.consultation_duration) {
            const start = new Date(`${date}T${schedule.start_time}`);
            start.setMinutes(start.getMinutes() + (queueNumber - 1) * doctor.consultation_duration);
            approxTime = start.toTimeString().slice(0, 5);
        }

        await db.query(
            "INSERT INTO appointments (patient_id, patient_name, doctor_id, doctor_name, clinic_id, clinic_name, date, time, queue_number) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
            [patient.id, patient.name, doctor.id, doctor.name, clinic.id, clinic.name, date, approxTime, queueNumber]
        );
        
        res.redirect(`/dashboard/patient?userId=${patientId}`);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error booking appointment.");
    }
});

// --- Doctor Actions ---
app.post("/doctor/update-appointment-status", async (req, res) => {
    const { doctorId, appointmentId, status, clinicId } = req.body;
    try {
        await db.query("UPDATE appointments SET status = $1 WHERE id = $2 AND doctor_id = $3", [status, appointmentId, doctorId]);
        res.redirect(`/dashboard/doctor?userId=${doctorId}&clinicId=${clinicId || ''}`);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error updating status.");
    }
});

app.post("/doctor/next-patient", async (req, res) => {
    // This route is correct from the previous step.
    const { doctorId, clinicId } = req.body;
    const today = new Date().toISOString().slice(0, 10);
    try {
        let query = `
            SELECT id FROM appointments 
            WHERE doctor_id = $1 AND date = $2 AND status NOT IN ('Done', 'Absent')
            ORDER BY queue_number ASC 
            LIMIT 1`;
        let params = [doctorId, today];

        if (clinicId) {
            query = `
            SELECT id FROM appointments 
            WHERE doctor_id = $1 AND clinic_id = $2 AND date = $3 AND status NOT IN ('Done', 'Absent')
            ORDER BY queue_number ASC 
            LIMIT 1`;
            params = [doctorId, clinicId, today];
        }

        const nextPatientRes = await db.query(query, params);

        if (nextPatientRes.rows.length > 0) {
            const appointmentToUpdateId = nextPatientRes.rows[0].id;
            await db.query("UPDATE appointments SET status = 'Done' WHERE id = $1", [appointmentToUpdateId]);
        }
        
        res.redirect(`/dashboard/doctor?userId=${doctorId}&clinicId=${clinicId || ''}`);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error advancing queue.");
    }
});

app.post("/doctor/set-limit", async (req, res) => {
    const { doctorId, dailyLimit } = req.body;
    try {
        await db.query("UPDATE doctors SET daily_limit = $1 WHERE id = $2", [parseInt(dailyLimit), doctorId]);
        res.redirect(`/dashboard/doctor?userId=${doctorId}`);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error setting daily limit.");
    }
});

app.post("/doctor/set-consultation-time", async (req, res) => {
    const { doctorId, duration } = req.body;
    try {
        await db.query("UPDATE doctors SET consultation_duration = $1 WHERE id = $2", [parseInt(duration), doctorId]);
        res.redirect(`/dashboard/doctor?userId=${doctorId}`);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error setting consultation time.");
    }
});

app.post("/doctor/delete-schedule", async (req, res) => {
    const { doctorId, scheduleId } = req.body;
    try {
        await db.query("DELETE FROM doctor_schedules WHERE id = $1 AND doctor_id = $2", [scheduleId, doctorId]);
        res.redirect(`/dashboard/doctor?userId=${doctorId}`);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error deleting schedule.");
    }
});

app.post("/doctor/clear-list", async (req, res) => {
    const { doctorId } = req.body;
    const today = new Date().toISOString().slice(0, 10);
    try {
        await db.query("DELETE FROM appointments WHERE doctor_id = $1 AND date = $2", [doctorId, today]);
        res.redirect(`/dashboard/doctor?userId=${doctorId}`);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error clearing today's list.");
    }
});

app.post("/doctor/reset-queue", async (req, res) => {
    const { doctorId, clinicId } = req.body;
    const today = new Date().toISOString().slice(0, 10);
    try {
        let query = "UPDATE appointments SET status = 'Confirmed' WHERE doctor_id = $1 AND date = $2 AND status = 'Done'";
        let params = [doctorId, today];
        if (clinicId) {
            query += " AND clinic_id = $3";
            params.push(clinicId);
        }
        await db.query(query, params);
        res.redirect(`/dashboard/doctor?userId=${doctorId}&clinicId=${clinicId || ''}`);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error resetting queue.");
    }
});

app.post("/doctor/add-clinic", async (req, res) => {
    const { doctorId, action, clinicId, address, startTime, endTime, days, customSchedule } = req.body;
    const scheduleDays = customSchedule || (Array.isArray(days) ? days.join(', ') : days || '');

    try {
        const doctorRes = await db.query("SELECT name, specialty FROM doctors WHERE id = $1", [doctorId]);
        const doctor = doctorRes.rows[0];

        if (action === 'join') {
            await db.query(
                `INSERT INTO clinic_join_requests (doctor_id, doctor_name, doctor_specialty, clinic_id, start_time, end_time, days, status) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
                [doctorId, doctor.name, doctor.specialty, clinicId, startTime, endTime, scheduleDays]
            );
        } else if (action === 'create') {
            const newClinicRes = await db.query(
                "INSERT INTO clinics (name, address) VALUES ($1, $2) RETURNING id",
                [`${doctor.name}'s Private Clinic`, address]
            );
            const newClinicId = newClinicRes.rows[0].id;
            await db.query(
                "INSERT INTO doctor_schedules (doctor_id, clinic_id, start_time, end_time, days) VALUES ($1, $2, $3, $4, $5)",
                [doctorId, newClinicId, startTime, endTime, scheduleDays]
            );
        }
        res.redirect(`/dashboard/doctor?userId=${doctorId}`);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error processing clinic request.");
    }
});

app.post("/doctor/handle-invitation", async (req, res) => {
    const { doctorId, invitationId, action } = req.body;
    try {
        if (action === 'accept') {
            const invRes = await db.query("SELECT * FROM receptionist_invitations WHERE id = $1", [invitationId]);
            const invitation = invRes.rows[0];
            if (invitation) {
                await db.query(
                    "INSERT INTO doctor_schedules (doctor_id, clinic_id, start_time, end_time, days) VALUES ($1, $2, $3, $4, $5)",
                    [invitation.doctor_id, invitation.clinic_id, invitation.start_time, invitation.end_time, invitation.days]
                );
            }
        }
        await db.query("DELETE FROM receptionist_invitations WHERE id = $1", [invitationId]);
        res.redirect(`/dashboard/doctor?userId=${doctorId}`);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error handling invitation.");
    }
});


// --- Receptionist Actions ---
app.get("/receptionist/doctor-appointments/:doctorId", async (req, res) => {
    const { doctorId } = req.params;
    const { receptionistId } = req.query;
    try {
        const receptionistRes = await db.query("SELECT * FROM receptionists WHERE id = $1", [receptionistId]);
        if (receptionistRes.rows.length === 0) return res.status(404).send("Receptionist not found");
        const receptionist = receptionistRes.rows[0];
        const clinicId = receptionist.clinic_id;

        const [doctorRes, clinicRes] = await Promise.all([
            db.query("SELECT * FROM doctors WHERE id = $1", [doctorId]),
            db.query("SELECT * FROM clinics WHERE id = $1", [clinicId])
        ]);
        if (doctorRes.rows.length === 0 || clinicRes.rows.length === 0) return res.status(404).send("Doctor or Clinic not found");
        
        const appointmentsRes = await db.query("SELECT * FROM appointments WHERE doctor_id = $1 AND clinic_id = $2", [doctorId, clinicId]);

        res.render("doctor-appointments.ejs", {
            doctor: doctorRes.rows[0],
            appointments: appointmentsRes.rows,
            clinic: clinicRes.rows[0],
            receptionist
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error fetching doctor appointments.");
    }
});

app.post("/receptionist/add-appointment", async (req, res) => {
    const { doctorId, clinicId, patientName, patientAge, receptionistId } = req.body;
    const date = new Date().toISOString().slice(0, 10);
    try {
        const [doctorRes, clinicRes, scheduleRes] = await Promise.all([
             db.query("SELECT * FROM doctors WHERE id = $1", [doctorId]),
             db.query("SELECT * FROM clinics WHERE id = $1", [clinicId]),
             db.query("SELECT * FROM doctor_schedules WHERE doctor_id = $1 AND clinic_id = $2", [doctorId, clinicId])
        ]);
        const doctor = doctorRes.rows[0];
        const clinic = clinicRes.rows[0];
        const schedule = scheduleRes.rows[0];
        if (!doctor || !clinic || !schedule) return res.status(404).send("Doctor or clinic schedule not found.");

        const appointmentsTodayRes = await db.query("SELECT COUNT(*) as count FROM appointments WHERE doctor_id = $1 AND date = $2 AND clinic_id = $3", [doctorId, date, clinicId]);
        const todaysAppointmentsCount = parseInt(appointmentsTodayRes.rows[0].count);

        if (doctor.daily_limit && todaysAppointmentsCount >= doctor.daily_limit) {
            return res.status(403).send(`Booking Failed: Dr. ${doctor.name}'s schedule is full.`);
        }
        
        const queueNumber = todaysAppointmentsCount + 1;
        let approxTime = schedule.start_time;
        if (doctor.consultation_duration) {
            const start = new Date(`${date}T${schedule.start_time}`);
            start.setMinutes(start.getMinutes() + (queueNumber - 1) * doctor.consultation_duration);
            approxTime = start.toTimeString().slice(0, 5);
        }

        await db.query(
            `INSERT INTO appointments (patient_name, doctor_id, doctor_name, clinic_id, clinic_name, date, time, queue_number) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [`${patientName} (Age: ${patientAge})`, doctor.id, doctor.name, clinic.id, clinic.name, date, approxTime, queueNumber]
        );

        res.redirect(`/receptionist/doctor-appointments/${doctorId}?receptionistId=${receptionistId}`);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error adding walk-in appointment.");
    }
});

app.post("/receptionist/handle-join-request", async (req, res) => {
    const { requestId, action, receptionistId } = req.body;
    try {
        if (action === 'accept') {
            const requestRes = await db.query("SELECT * FROM clinic_join_requests WHERE id = $1", [requestId]);
            const request = requestRes.rows[0];
            if (request) {
                await db.query(
                    "INSERT INTO doctor_schedules (doctor_id, clinic_id, start_time, end_time, days) VALUES ($1, $2, $3, $4, $5)",
                    [request.doctor_id, request.clinic_id, request.start_time, request.end_time, request.days]
                );
            }
        }
        await db.query("DELETE FROM clinic_join_requests WHERE id = $1", [requestId]);
        res.redirect(`/dashboard/receptionist?userId=${receptionistId}`);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error handling join request.");
    }
});

app.post("/receptionist/add-doctor", async (req, res) => {
    const { receptionistId, name, specialty, username, password, startTime, endTime, days, customSchedule, Phonenumber } = req.body;
    try {
        const receptionistRes = await db.query("SELECT clinic_id FROM receptionists WHERE id = $1", [receptionistId]);
        const clinicId = receptionistRes.rows[0].clinic_id;

        const newDoctorRes = await db.query(
            "INSERT INTO doctors (name, specialty, username, password, phone) VALUES ($1, $2, $3, $4, $5) RETURNING id",
            [name, specialty, username, password, Phonenumber]
        );
        const newDoctorId = newDoctorRes.rows[0].id;

        const scheduleDays = customSchedule || (Array.isArray(days) ? days.join(', ') : days || '');

        await db.query(
            "INSERT INTO doctor_schedules (doctor_id, clinic_id, start_time, end_time, days) VALUES ($1, $2, $3, $4, $5)",
            [newDoctorId, clinicId, startTime, endTime, scheduleDays]
        );
        
        res.redirect(`/dashboard/receptionist?userId=${receptionistId}`);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error adding new doctor.");
    }
});

app.post("/receptionist/invite-doctor", async (req, res) => {
    const { receptionistId, doctorId, startTime, endTime, days, customSchedule } = req.body;
    try {
        const receptionistRes = await db.query("SELECT clinic_id FROM receptionists WHERE id = $1", [receptionistId]);
        const clinicId = receptionistRes.rows[0].clinic_id;
        const scheduleDays = customSchedule || (Array.isArray(days) ? days.join(', ') : days || '');
        
        await db.query(
            `INSERT INTO receptionist_invitations (doctor_id, receptionist_id, clinic_id, start_time, end_time, days, status) 
             VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
             [doctorId, receptionistId, clinicId, startTime, endTime, scheduleDays]
        );
        res.redirect(`/dashboard/receptionist?userId=${receptionistId}`);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error sending invitation.");
    }
});

app.post("/receptionist/delete-doctor", async (req, res) => {
    const { doctorId, receptionistId } = req.body;
    try {
        const receptionistRes = await db.query("SELECT clinic_id FROM receptionists WHERE id = $1", [receptionistId]);
        const clinicId = receptionistRes.rows[0].clinic_id;
        // This only removes the doctor from the clinic, doesn't delete the doctor's account
        await db.query("DELETE FROM doctor_schedules WHERE doctor_id = $1 AND clinic_id = $2", [doctorId, clinicId]);
        res.redirect(`/dashboard/receptionist?userId=${receptionistId}`);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error removing doctor from clinic.");
    }
});


// --- Admin Actions ---
app.get("/admin/patient-details/:patientId", async (req, res) => {
    // This route is correct from the previous step.
    const { patientId } = req.params;
    const { adminId } = req.query;
    try {
        const patientRes = await db.query("SELECT * FROM patients WHERE id = $1", [patientId]);
        if (patientRes.rows.length === 0) return res.status(404).send("Patient not found");
        
        const appointmentsRes = await db.query("SELECT * FROM appointments WHERE patient_id = $1 ORDER BY date DESC, time DESC", [patientId]);
        
        res.render("admin-patient-details.ejs", { 
            patient: patientRes.rows[0], 
            appointments: appointmentsRes.rows, 
            adminId 
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error fetching patient details.");
    }
});

app.post("/admin/add-clinic", async (req, res) => {
    const { name, address, phone, receptionistName, username, password, adminId } = req.body;
    try {
        const newClinicRes = await db.query(
            "INSERT INTO clinics (name, address, phone) VALUES ($1, $2, $3) RETURNING id",
            [name, address, phone]
        );
        const newClinicId = newClinicRes.rows[0].id;

        await db.query(
            "INSERT INTO receptionists (name, clinic_id, username, password) VALUES ($1, $2, $3, $4)",
            [receptionistName, newClinicId, username, password]
        );

        res.redirect(`/dashboard/admin?userId=${adminId}`);
    } catch(err) {
        console.error(err);
        res.status(500).send("Error adding clinic.");
    }
});

app.post("/admin/delete-clinic", async (req, res) => {
    const { clinicId, adminId } = req.body;
    try {
        // Need to delete from referencing tables first if ON DELETE CASCADE is not set for all foreign keys.
        await db.query("DELETE FROM receptionists WHERE clinic_id = $1", [clinicId]);
        await db.query("DELETE FROM clinics WHERE id = $1", [clinicId]); // This will cascade to schedules, requests, etc.
        res.redirect(`/dashboard/admin?userId=${adminId}`);
    } catch(err) {
        console.error(err);
        res.status(500).send("Error deleting clinic.");
    }
});

app.post("/admin/add-doctor", async (req, res) => {
    const { name, specialty, username, password, phone, dailyLimit, adminId } = req.body;
    try {
        const newDoctorRes = await db.query(
            "INSERT INTO doctors (name, specialty, username, password, phone, daily_limit) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
            [name, specialty, username, password, phone, dailyLimit]
        );
        const newDoctorId = newDoctorRes.rows[0].id;
        // Note: Logic for assigning to multiple clinics from the admin form would need to be added here if required.
        res.redirect(`/dashboard/admin?userId=${adminId}`);
    } catch(err) {
        console.error(err);
        res.status(500).send("Error adding doctor.");
    }
});

app.post("/admin/delete-doctor", async (req, res) => {
    const { doctorId, adminId } = req.body;
    try {
        await db.query("DELETE FROM doctors WHERE id = $1", [doctorId]); // Cascades will handle related data
        res.redirect(`/dashboard/admin?userId=${adminId}`);
    } catch(err) {
        console.error(err);
        res.status(500).send("Error deleting doctor.");
    }
});

app.post("/admin/delete-patient", async (req, res) => {
    const { patientId, adminId } = req.body;
    try {
        await db.query("DELETE FROM appointments WHERE patient_id = $1", [patientId]);
        await db.query("DELETE FROM patients WHERE id = $1", [patientId]);
        res.redirect(`/dashboard/admin?userId=${adminId}`);
    } catch(err) {
        console.error(err);
        res.status(500).send("Error deleting patient.");
    }
});


// --- API Routes for Live Search/Queue (Example) ---
app.get("/api/doctors", async (req, res) => {
    const { name, specialty, clinic, date } = req.query;
    try {
        let query = `
            SELECT DISTINCT d.id, d.name, d.specialty, ds.start_time, ds.end_time, c.id as clinic_id, c.name as clinic_name 
            FROM doctors d 
            JOIN doctor_schedules ds ON d.id = ds.doctor_id
            JOIN clinics c ON ds.clinic_id = c.id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (name) {
            query += ` AND d.name ILIKE $${paramIndex++}`;
            params.push(`%${name}%`);
        }
        if (specialty) {
            query += ` AND d.specialty ILIKE $${paramIndex++}`;
            params.push(`%${specialty}%`);
        }
        if (clinic) {
            query += ` AND (c.name ILIKE $${paramIndex} OR c.address ILIKE $${paramIndex})`;
            params.push(`%${clinic}%`);
            paramIndex++;
        }
        
        const results = await db.query(query, params);

        // This simplified version just returns doctors. Slot calculation would require more logic.
        const doctors = results.rows.reduce((acc, row) => {
            let doctor = acc.find(d => d.id === row.id);
            if (!doctor) {
                doctor = { id: row.id, name: row.name, specialty: row.specialty, schedules: [] };
                acc.push(doctor);
            }
            doctor.schedules.push({
                clinicId: row.clinic_id,
                clinic: { name: row.clinic_name },
                startTime: row.start_time,
                endTime: row.end_time
            });
            return acc;
        }, []);

        res.json(doctors);
    } catch(err) {
        console.error("API Error:", err);
        res.status(500).json({ error: "Failed to fetch doctors" });
    }
});

app.get("/api/queue-status/:doctorId/:clinicId", async (req, res) => {
    const { doctorId, clinicId } = req.params;
    const today = new Date().toISOString().slice(0, 10);
    try {
        const query = `
            SELECT status, queue_number 
            FROM appointments 
            WHERE doctor_id = $1 AND clinic_id = $2 AND date = $3`;
        const appointmentsRes = await db.query(query, [doctorId, clinicId, today]);
        const appointments = appointmentsRes.rows;

        const doneAppointments = appointments.filter(a => a.status === 'Done');
        const currentNumber = doneAppointments.length;
        
        res.json({
            currentNumber: currentNumber,
            totalPatients: appointments.length
        });

    } catch(err) {
        console.error("Queue API Error:", err);
        res.status(500).json({ error: "Failed to fetch queue status" });
    }
});


// --- Server ---
app.listen(port, () => {
    console.log(`Clinic Appointment System running on http://localhost:${port}`);
});

