import { Schema , model , Types} from 'mongoose';

export interface User {
    email: string;
    password: string;
    departmentId: Types.ObjectId;
}

const schema = new Schema<User>({
     email:{
        type: String,
        required: true,
        unique: true,
     },
     password: { type: String, required: true },
     departmentId:{
        type: Schema.Types.ObjectId,
        ref: 'Department',
        required: true,
     }
})


export default model<User>('User', schema);