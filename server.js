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

let doctorSchedules = [
    { id: 1, doctorId: 1, clinicId: 1, startTime: "09:00", endTime: "17:00", days: "Monday, Tuesday, Wednesday" },
    { id: 2, doctorId: 2, clinicId: 1, startTime: "10:00", endTime: "12:00", days: "Monday, Wednesday, Friday" },
    { id: 3, doctorId: 2, clinicId: 2, startTime: "13:00", endTime: "15:00", days: "Monday, Wednesday, Friday" }
];

let receptionists = [
    { id: 1, name: "Ravi Kumar", clinicId: 1, username: "ravi", password: "password123" },
    { id: 2, name: "Deepak Singh", clinicId: 2, username: "deepak", password: "password123" }
];

let admins = [
    { id: 1, name: "Admin User", username: "admin", password: "password123" }
];

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

// Handle Signup Logic (Only for patients to use themselves)
app.post("/signup/:role", (req, res) => {
    const role = req.params.role;
    const { name, dob, mobile, username, password } = req.body;
    if (mobile.length !== 10) {
        return res.render("signup.ejs", { role: role, error: "Mobile number must be exactly 10 digits." });
    }
    if (role === 'patient') {
        const newUser = { id: ++last_patient_id, name, dob, mobile, username, password };
        patients.push(newUser);
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
    res.redirect(`/dashboard/admin?userId=${adminId}`);
});

// Receptionist adds a new doctor
app.post("/receptionist/add-doctor", (req, res) => {
    const { name, specialty, username, password, startTime, endTime, days, customSchedule, receptionistId } = req.body;
    
    const newDoctor = { id: ++last_doctors_id, name, specialty, username, password };
    doctors.push(newDoctor);
    
    const receptionist = receptionists.find(r => r.id == receptionistId);
    
    let finalSchedule;
    if (customSchedule && customSchedule.trim() !== '') {
        finalSchedule = customSchedule;
    } else if (days) {
        finalSchedule = Array.isArray(days) ? days.join(', ') : days;
    } else {
        finalSchedule = 'Not Specified';
    }

    const newSchedule = {
        id: ++last_schedule_id,
        doctorId: newDoctor.id,
        clinicId: receptionist.clinicId,
        startTime,
        endTime,
        days: finalSchedule
    };
    doctorSchedules.push(newSchedule);
    res.redirect(`/dashboard/receptionist?userId=${receptionistId}`);
});

// ⭐ NEW: Receptionist adds a new patient
app.post("/receptionist/add-patient", (req, res) => {
    const { name, dob, mobile, username, password, receptionistId } = req.body;

    if (!mobile || mobile.length !== 10) {
        // You can add more robust error handling here
        return res.status(400).send("Mobile number must be exactly 10 digits. Please go back and try again.");
    }

    const newPatient = {
        id: ++last_patient_id,
        name,
        dob,
        mobile,
        username,
        password
    };
    patients.push(newPatient);
    console.log("New patient added by receptionist:", newPatient);
    
    // Redirect back to the receptionist's dashboard
    res.redirect(`/dashboard/receptionist?userId=${receptionistId}`);
});


// Enhanced Dashboards
app.get("/dashboard/:role", (req, res) => {
    const { role } = req.params;
    const { userId } = req.query;
    
    switch(role) {
        case 'patient':
            // ... (no changes here)
            const patient = patients.find(p => p.id == userId);
            const patientAppointments = appointments.filter(a => a.patientId == userId);
            if (!patient) return res.redirect(`/login/patient`);
            res.render("patient-dashboard.ejs", { patient, appointments: patientAppointments, doctors, clinics, doctorSchedules });
            break;
            
        case 'doctor':
             // ... (no changes here)
            const doctor = doctors.find(d => d.id == userId);
            if (!doctor) return res.redirect(`/login/doctor`);
            const doctorAppointments = appointments.filter(app => app.doctorId == userId).map(appointment => {
                const patientInfo = patients.find(p => p.id === appointment.patientId);
                const clinicInfo = clinics.find(c => c.id === appointment.clinicId);
                return { ...appointment, patient: patientInfo, clinic: clinicInfo };
            });
            const doctorClinics = doctorSchedules.filter(s => s.doctorId == userId).map(schedule => {
                const clinic = clinics.find(c => c.id === schedule.clinicId);
                return { ...schedule, clinic };
            });
            res.render("doctor-dashboard.ejs", { doctor, appointments: doctorAppointments, schedules: doctorClinics });
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
                patients, // Make sure all patients are passed to the template
                doctors: clinicDoctors
            });
            break;
            
        case 'admin':
            // ... (no changes here)
            const admin = admins.find(a => a.id == userId);
            if (!admin) return res.redirect(`/login/admin`);
            res.render("admin-dashboard.ejs", { admin, patients, doctors, receptionists, appointments, clinics, doctorSchedules });
            break;
            
        default:
            res.status(404).send("Dashboard not found");
    }
});

// Enhanced appointment booking
app.post("/book-appointment", (req, res) => {
    // ... (no changes here)
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
    res.redirect(`/dashboard/patient?userId=${patientId}`);
});

// API to get doctors by clinic
app.get("/api/doctors-by-clinic/:clinicId", (req, res) => {
    // ... (no changes here)
    const clinicId = parseInt(req.params.clinicId);
    const clinicDoctors = getDoctorsByClinic(clinicId);
    res.json(clinicDoctors);
});

// Receptionist view: Doctor's Appointments
app.get("/receptionist/doctor-appointments/:doctorId", (req, res) => {
    const doctorId = parseInt(req.params.doctorId);
    const doctor = doctors.find(d => d.id === doctorId);
    if (!doctor) return res.status(404).send("Doctor not found");

    const doctorAppointments = appointments.filter(a => a.doctorId === doctorId);
    
    res.render("doctor-appointments.ejs", {
        doctor,
        appointments: doctorAppointments
    });
});

// Receptionist adds new appointment manually
app.post("/receptionist/add-appointment", (req, res) => {
    const { doctorId, patientName, date, time } = req.body;

    const doctor = doctors.find(d => d.id == doctorId);
    if (!doctor) return res.status(404).send("Doctor not found");

    // Doctor কোন clinic এ আছে সেটা বের করব
    const doctorSchedule = doctorSchedules.find(s => s.doctorId == doctor.id);
    const clinic = clinics.find(c => c.id == doctorSchedule.clinicId);

    const newAppointment = {
        id: ++last_appointment_id,
        patientId: null, // কারণ direct নাম দেওয়া হচ্ছে
        patientName,
        doctorId: doctor.id,
        doctorName: doctor.name,
        clinicId: clinic.id,
        clinicName: clinic.name,
        date,
        time,
        status: "Confirmed"
    };

    appointments.push(newAppointment);
    console.log("New appointment added by receptionist:", newAppointment);

    res.redirect(`/receptionist/doctor-appointments/${doctorId}`);
});

// admin erjono
// --- Admin Adds Clinic ---
app.post("/admin/add-clinic", (req, res) => {
    const { name, address, phone, adminId } = req.body;
    const newClinic = { id: ++last_clinic_id, name, address, phone };
    clinics.push(newClinic);
    console.log("New clinic added:", newClinic);
    res.redirect(`/dashboard/admin?userId=${adminId}`);
});

// --- Admin Deletes Clinic ---
app.post("/admin/delete-clinic", (req, res) => {
    const { clinicId, adminId } = req.body;
    const id = parseInt(clinicId);
    clinics = clinics.filter(c => c.id !== id);
    doctorSchedules = doctorSchedules.filter(s => s.clinicId !== id); // remove schedules too
    appointments = appointments.filter(a => a.clinicId !== id); // remove appointments
    console.log("Clinic deleted:", id);
    res.redirect(`/dashboard/admin?userId=${adminId}`);
});

// --- Admin Deletes Doctor ---
app.post("/admin/delete-doctor", (req, res) => {
    const { doctorId, adminId } = req.body;
    const id = parseInt(doctorId);
    doctors = doctors.filter(d => d.id !== id);
    doctorSchedules = doctorSchedules.filter(s => s.doctorId !== id); // remove schedules
    appointments = appointments.filter(a => a.doctorId !== id); // remove appointments
    console.log("Doctor deleted:", id);
    res.redirect(`/dashboard/admin?userId=${adminId}`);
});

// --- Update: Admin Adds Doctor with Clinic ---
app.post("/admin/add-doctor", (req, res) => {
    const { name, specialty, username, password, locationType, clinicId, customAddress, startTime, endTime, days, adminId } = req.body;

    const newDoctor = { id: ++last_doctors_id, name, specialty, username, password };
    doctors.push(newDoctor);

    let assignedClinicId;
    if (locationType === "clinic") {
        assignedClinicId = parseInt(clinicId);
    } else if (locationType === "custom") {
        // Create a virtual clinic entry for this doctor’s private practice
        const newClinic = {
            id: ++last_clinic_id,
            name: `${newDoctor.name}'s Practice`,
            address: customAddress || "Not Specified",
            phone: "N/A"
        };
        clinics.push(newClinic);
        assignedClinicId = newClinic.id;
    }

    const newSchedule = {
        id: ++last_schedule_id,
        doctorId: newDoctor.id,
        clinicId: assignedClinicId,
        startTime,
        endTime,
        days
    };
    doctorSchedules.push(newSchedule);

    console.log("New doctor added:", newDoctor, "Schedule:", newSchedule);
    res.redirect(`/dashboard/admin?userId=${adminId}`);
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