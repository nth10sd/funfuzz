class NewClass {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    getX() {
        return this.x;
    }

    getY() {
        return this.y;
    }
}

class NewClass2 extends NewClass {
    constructor(x, y, z) {
        super(x, y);
        this.z = z;
    }

    getZ() {
        return this.z;
    }
}

class NewClass3 extends NewClass2 {
    constructor(x, y, z, m) {
        super(x, y, z);
        this.m = m;
    }

    getX() {
        const result = super.getX();
        return result + 1;
    }

    getM() {
        return this.m;
    }
}

let a = new NewClass(1, "value y");
let b = new NewClass2(1, "value y", "z");
let c = new NewClass3(1, "value y", "z", "value m");
print(a.getX());
