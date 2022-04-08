import json
import argparse

#json_file = "knowledge.json"
#csv_file  = "knowledge.csv"
#delimiter = ";"

def run_it_all(csv_in, json_out, delimiter=";"):
	with open(csv_in, "r") as csv_file:
		raw = [line.split(delimiter) for line in csv_file.readlines()]

	data = {"knowledge": {}}
	features = [feat.strip("\n") for feat in raw[0]]
	persons = []
	antonyms = {"is_fictional": "is_real", "is_male": "is_female", "is_alive": "is_dead"}

	def negate(v_word):
		if v_word == "yes":
			return "no"
		elif v_word == "no":
			return "yes"
		else:
			return v_word		

	for person in raw[1:]:
		pd = {}
		for feature, value in zip(features, person):
			#print(feature)
			feature = feature.strip("\n")
			value   = value.strip("\n")
			if feature == "Alias":
				if "," in value:
					value = value.split(",")
					for v in value:
						pd[f"is {v}".replace(" ", "_")] = "success"
				continue
			if feature == "Character":
				name = value
				persons.append(name)
				pd[f"is {name}".replace(" ", "_").lower()] = "success"
			pd[feature] = value
			if feature in antonyms.keys():
				a_feature = antonyms[feature]
				a_value   = negate(value)
				pd[a_feature] = a_value
		data["knowledge"][name] = pd
	data["characters"] = persons
	non_features = ["Character", "Alias"]
	features = [f for f in features if f not in non_features]
	data["features"] = features

	#print(persons)
	print(data)

	with open(json_out, "w") as f:
	    json.dump(data, f)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(dest="csvin", type=str, help="Input CSV file.")
    parser.add_argument(dest="out", type=str, help="Output JSON file.")
    parser.add_argument("--sep", default=";", type=str, help="Separator (default = ';').")

    args = parser.parse_args()

    if args.sep:
        run_it_all(args.csvin, args.out, args.sep)
    else:
        run_it_all(args.csvin, args.out)
