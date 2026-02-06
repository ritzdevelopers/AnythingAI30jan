import { Schema, model, Types } from 'mongoose';

export interface Department {
    name: string;
    icon?: string;
    description?: string;
    accessCode?: string;
    createdAt: Date;
}

const departmentSchema = new Schema<Department>({
    name: {
        type: String,
        required: true,

    },
    accessCode:{
        type: String,
    },
    icon:{
        type: String,
    },
    description:{
        type: String,
    },
}, {timestamps: true});

const Department = model<Department>('Department', departmentSchema);

export default Department;