import express from "express";
import bodyParser from "body-parser";

const app = express();
const port = 3000;

// --- Middleware ---
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");

// --- Enhanced In-Memory Data Storage ---
let patients = [
    { id: 1, name: "Soumya Chatterjee", dob: "2005-02-28", mobile: "1234567890", username: "soumya", password: "12345678" }
];

let clinics = [
    { id: 1, name: "Ravi Clinic", address: "123 Main Street, Durgapur", phone: "9876543210" },
    { id: 2, name: "Deepak Clinic", address: "456 Park Avenue, Durgapur", phone: "9876543211" }
];

let doctors = [
    { id: 1, name: "Dr. Priya Verma", specialty: "Cardiologist", username: "priya", password: "1234" },
    { id: 2, name: "Dr. Biswajit Kumar", specialty: "General Medicine", username: "biswajit", password: "biswa123" }
];

// Doctor schedules at different clinics
let doctorSchedules = [
    { id: 1, doctorId: 1, clinicId: 1, startTime: "09:00", endTime: "17:00", days: ["Monday", "Tuesday", "Wednesday"] },
    { id: 2, doctorId: 2, clinicId: 1, startTime: "10:00", endTime: "12:00", days: ["Monday", "Wednesday", "Friday"] },
    { id: 3, doctorId: 2, clinicId: 2, startTime: "13:00", endTime: "15:00", days: ["Monday", "Wednesday", "Friday"] }
];

// Receptionists are now associated with specific clinics
let receptionists = [
    { id: 1, name: "Ravi Kumar", clinicId: 1, username: "ravi", password: "password123" },
    { id: 2, name: "Deepak Singh", clinicId: 2, username: "deepak", password: "password123" }
];

let admins = [
    { id: 1, name: "Admin User", username: "admin", password: "password123" }
];

// Enhanced appointments with clinic information
let appointments = [
    { 
        id: 1, 
        patientId: 1, 
        patientName: "Soumya Chatterjee", 
        doctorId: 1, 
        doctorName: "Dr. Priya Verma", 
        clinicId: 1,
        clinicName: "Ravi Clinic",
        date: "2025-09-20", 
        time: "10:00 AM", 
        status: "Confirmed" 
    }
];

let last_patient_id = 1, last_doctors_id = 2, last_receptionists_id = 2, last_admins_id = 1;
let last_appointment_id = 1, last_clinic_id = 2, last_schedule_id = 3;

// --- Helper Functions ---
function getDoctorsByClinic(clinicId) {
    const schedules = doctorSchedules.filter(s => s.clinicId == clinicId);
    return schedules.map(schedule => {
        const doctor = doctors.find(d => d.id === schedule.doctorId);
        return { ...doctor, schedule };
    });
}

function getClinicAppointments(clinicId) {
    return appointments.filter(app => app.clinicId == clinicId);
}

// --- Routes ---
app.get("/", (req, res) => { res.render("index.ejs"); });
app.get("/login/:role", (req, res) => { res.render("login.ejs", { role: req.params.role, error: null }); });
app.get("/signup/:role", (req, res) => { res.render("signup.ejs", { role: req.params.role, error: null }); });

// Handle Login Logic
app.post("/login/:role", (req, res) => {
    const role = req.params.role;
    const { username, password } = req.body;
    let userList;
    switch(role) {
        case 'patient': userList = patients; break;
        case 'doctor': userList = doctors; break;
        case 'receptionist': userList = receptionists; break;
        case 'admin': userList = admins; break;
        default: return res.status(400).send("Invalid role");
    }
    const user = userList.find(u => u.username === username && u.password === password);
    if (user) {
        res.redirect(`/dashboard/${role}?userId=${user.id}`);
    } else {
        res.render("login.ejs", { role: role, error: "Invalid username or password." });
    }
});

// Handle Signup Logic (Only for patients)
app.post("/signup/:role", (req, res) => {
    const role = req.params.role;
    const { name, dob, mobile, username, password } = req.body;
    if (mobile.length !== 10) {
        return res.render("signup.ejs", { role: role, error: "Mobile number must be exactly 10 digits." });
    }
    if (role === 'patient') {
        const newUser = { id: ++last_patient_id, name, dob, mobile, username, password };
        patients.push(newUser);
        console.log("New patient added:", newUser);
        res.redirect(`/login/${role}`);
    } else {
        return res.status(403).send("Signup is only allowed for patients.");
    }
});

// Admin adds a new doctor
app.post("/admin/add-doctor", (req, res) => {
    const { name, specialty, username, password, adminId } = req.body;
    const newDoctor = { id: ++last_doctors_id, name, specialty, username, password };
    doctors.push(newDoctor);
    console.log("New doctor added by admin:", newDoctor);
    res.redirect(`/dashboard/admin?userId=${adminId}`);
});

// NEW: Receptionist adds a new doctor
app.post("/receptionist/add-doctor", (req, res) => {
    const { name, specialty, username, password, startTime, endTime, days, receptionistId } = req.body;
    
    // Add the new doctor
    const newDoctor = { id: ++last_doctors_id, name, specialty, username, password };
    doctors.push(newDoctor);
    
    // Get receptionist's clinic
    const receptionist = receptionists.find(r => r.id == receptionistId);
    
    // Add doctor schedule for this clinic
    const newSchedule = {
        id: ++last_schedule_id,
        doctorId: newDoctor.id,
        clinicId: receptionist.clinicId,
        startTime,
        endTime,
        days: Array.isArray(days) ? days : [days]
    };
    doctorSchedules.push(newSchedule);
    
    console.log("New doctor added by receptionist:", newDoctor);
    console.log("Doctor schedule added:", newSchedule);
    res.redirect(`/dashboard/receptionist?userId=${receptionistId}`);
});

// Enhanced Dashboards
app.get("/dashboard/:role", (req, res) => {
    const { role } = req.params;
    const { userId } = req.query;
    
    switch(role) {
        case 'patient':
            const patient = patients.find(p => p.id == userId);
            const patientAppointments = appointments.filter(a => a.patientId == userId);
            if (!patient) return res.redirect(`/login/patient`);
            res.render("patient-dashboard.ejs", { 
                patient, 
                appointments: patientAppointments, 
                doctors, 
                clinics, 
                doctorSchedules 
            });
            break;
            
        case 'doctor':
            const doctor = doctors.find(d => d.id == userId);
            if (!doctor) return res.redirect(`/login/doctor`);
            
            // Get doctor's appointments with clinic info
            const doctorAppointments = appointments
                .filter(app => app.doctorId == userId)
                .map(appointment => {
                    const patientInfo = patients.find(p => p.id === appointment.patientId);
                    const clinicInfo = clinics.find(c => c.id === appointment.clinicId);
                    return { ...appointment, patient: patientInfo, clinic: clinicInfo };
                });
            
            // Get doctor's schedules
            const doctorClinics = doctorSchedules
                .filter(s => s.doctorId == userId)
                .map(schedule => {
                    const clinic = clinics.find(c => c.id === schedule.clinicId);
                    return { ...schedule, clinic };
                });
            
            res.render("doctor-dashboard.ejs", { 
                doctor, 
                appointments: doctorAppointments,
                schedules: doctorClinics 
            });
            break;
            
        case 'receptionist':
            const receptionist = receptionists.find(r => r.id == userId);
            if (!receptionist) return res.redirect(`/login/receptionist`);
            
            const receptionistClinic = clinics.find(c => c.id === receptionist.clinicId);
            const clinicAppointments = getClinicAppointments(receptionist.clinicId);
            const clinicDoctors = getDoctorsByClinic(receptionist.clinicId);
            
            res.render("receptionist-dashboard.ejs", { 
                receptionist, 
                clinic: receptionistClinic,
                appointments: clinicAppointments, 
                patients,
                doctors: clinicDoctors
            });
            break;
            
        case 'admin':
            const admin = admins.find(a => a.id == userId);
            if (!admin) return res.redirect(`/login/admin`);
            res.render("admin-dashboard.ejs", { 
                admin, 
                patients, 
                doctors, 
                receptionists, 
                appointments,
                clinics,
                doctorSchedules
            });
            break;
            
        default:
            res.status(404).send("Dashboard not found");
    }
});

// Enhanced appointment booking
app.post("/book-appointment", (req, res) => {
    const { patientId, doctorId, clinicId, date, time } = req.body;
    const patient = patients.find(p => p.id == patientId);
    const doctor = doctors.find(d => d.id == doctorId);
    const clinic = clinics.find(c => c.id == clinicId);
    
    const newAppointment = {
        id: ++last_appointment_id,
        patientId: parseInt(patientId),
        patientName: patient.name,
        doctorId: parseInt(doctorId),
        doctorName: doctor.name,
        clinicId: parseInt(clinicId),
        clinicName: clinic.name,
        date: date,
        time: time,
        status: "Confirmed"
    };
    appointments.push(newAppointment);
    console.log("New appointment booked:", newAppointment);
    res.redirect(`/dashboard/patient?userId=${patientId}`);
});

// API to get doctors by clinic (for dynamic dropdown)
app.get("/api/doctors-by-clinic/:clinicId", (req, res) => {
    const clinicId = parseInt(req.params.clinicId);
    const clinicDoctors = getDoctorsByClinic(clinicId);
    res.json(clinicDoctors);
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
    console.log(`\nDefault login credentials:`);
    console.log(`Patient: soumya/12345678`);
    console.log(`Doctor: priya/1234 or biswajit/biswa123`);
    console.log(`Receptionist (Ravi Clinic): ravi/password123`);
    console.log(`Receptionist (Deepak Clinic): deepak/password123`);
    console.log(`Admin: admin/password123`);
});