const rules = {
    name: (v)=>{
        if(typeof v !=='string' || v.trim().length<3 || v.length>255){
            return 'Name must be between 3 and 255 characters.';
        }
        return null;
    },
    email: (v) =>{
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if(typeof v!== 'string' || !emailRegex.test(v)){
            return 'Invalid email format.';
        }
        return null;
    },
    password: (v)=>{
        if(typeof v !== 'string' || v.length < 8){
            return 'Password must be at least 8 characters.';
        }
        return null;
    },
    dob: (v)=>{
        const date = new Date(v);
        if(isNaN(date.getTime())) return 'Invalid date of birth.';

        const age=(Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
        if(age < 18) return 'Must be at least 18 years old to register.';
        return null;
    },
    phone_no: (v) =>{
        const phoneRegex = /^\+?[0-9]{10,15}$/;
        if(typeof v !== 'string' || !phoneRegex.test(v)){
            return 'Invalid phone number format.'
        }
        return null;
    },
    tax_id: (v, body)=>{
        if(body.tax_id_type==='PAN'){
            if(!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(v)){
                return 'Invalid PAN format (expected ABCDE1234F).'
            }
        }
        if(body.tax_id_type==='SSN'){
            if(!/^[0-9]{3}-[0-9]{2}-[0-9]{4}$/.test(v)){
                return 'Invalid SSN format (expected 000-00-0000).';
            }
        }
        return null;
    },
    tax_id_type: (v)=>{
        if(!['PAN','SSN','NID'].includes(v)){
            return 'tax_id_type must be one of PAN, SSN, NID.'
        }
        return null;
    }
};

export const validateRegistration = (req, res, next)=>{
    const errors = [];
    let fields=['name','email','password','dob','phone_no','tax_id','tax_id_type'];
    for(const field of fields){
        const value = req.body[field];

        if(value === undefined || value===null || value === ''){
            errors.push(`${field} is required.`);
            continue;
        }

        const error= rules[field](value, req.body);
        if(error) errors.push(error);
    }
    if(errors.length>0){
        return res.status(400).json({errors});
    }
    next();
};

export const validateLogin= (req,res,next)=>{
    const errors=[];
    let fields = ['email','password'];
    for(const field of fields){
        const value=req.body[field];
        if(value===undefined || value===null || value===''){
            errors.push(`${field} is required`);
            continue;
        }
        const error=rules[field](value);
        if(error) errors.push(error);
    }
    if(errors.length>0){
        return res.status(400).json({errors});
    }
    next();
}

const ALLOWED_FIELDS = [
    'name','email','password','dob',
    'phone_no','tax_id','tax_id_type','country_code'
];

export const rejectUnexpectedFieldsRegister = (req,res,next)=>{
    const receivedFields = Object.keys(req.body);
    const unexpected = receivedFields.filter(f => !ALLOWED_FIELDS.includes(f));

    if(unexpected.length>0){
        return res.status(400).json({
            error: `Unexpected field(s) not allowed: ${unexpected.join(', ')}`
        });
    }
    next();
}