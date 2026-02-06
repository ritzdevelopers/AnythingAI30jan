import { Schema, model, Types } from 'mongoose';

export interface Department {
    name: string;
    icon?: string;
    description?: string;
    createdAt: Date;
}

const departmentSchema = new Schema<Department>({
    name: {
        type: String,
        required: true,

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