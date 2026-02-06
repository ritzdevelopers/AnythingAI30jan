import { Schema , model , Types} from 'mongoose';

export interface User {
    email: string;
    password: string;
    departmentId: Types.ObjectId;
}

const schema = new Schema<User>({
     
})